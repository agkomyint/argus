import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { observations, projectProducts } from "@/db/schema";
import { proposeClaims } from "@/lib/agents/orchestrator";
import { checkClaims } from "@/lib/claim-math";
import { enqueue } from "@/lib/jobs";
import { recordObservation } from "@/lib/observations";
import { MODEL_ID, traced } from "@/lib/trace";

/**
 * Claims source. Reads the speech and the vision Observations of one project, asks Muse Spark which spoken
 * claims the footage shows or contradicts, then lets code check every turn, quote and evidence reference.
 */

export const CLAIMS_PRODUCT = "claims-vs-evidence";
const MAX_TURNS = 40;
const MAX_EVIDENCE = 60;
const SEEN = ["video_incident", "video_text", "responder_count"];

/** Queue a claim check when the product is on, speech and evidence both exist, and none has run. Safe to call often. */
export async function queueClaims(projectId: string): Promise<boolean> {
  const [on] = await db.select({ id: projectProducts.productId }).from(projectProducts).where(and(eq(projectProducts.projectId, projectId), eq(projectProducts.productId, CLAIMS_PRODUCT)));
  if (!on) return false;
  const [s] = await db.execute<{ turns: number; seen: number; queued: number; done: number }>(sql`
    select (select count(*)::int from observations where project_id = ${projectId} and type = 'transcript_turn') as turns,
           (select count(*)::int from observations where project_id = ${projectId} and type in ('video_incident','video_text','responder_count')) as seen,
           (select count(*)::int from jobs where project_id = ${projectId} and kind = 'check_claims' and status <> 'failed') as queued,
           (select count(*)::int from observations where project_id = ${projectId} and type = 'claim_check') as done`);
  if (!s.turns || !s.seen || s.queued > 0 || s.done > 0) return false;
  await enqueue(projectId, "check_claims", {}, { source: "files" });
  return true;
}

const evidenceText = (type: string, p: Record<string, unknown>) =>
  type === "video_incident" ? `at ${p.at}: ${p.kind}. ${p.description}`
  : type === "video_text" ? `at ${p.at}: on-screen ${p.where} reads "${p.text}"`
  : `at ${p.at}: ${p.vehicles} emergency vehicles and ${p.people} responders visible`;

/** Job handler: write one `claim_check` Observation per claim that survives the code checks. */
export async function checkProjectClaims(projectId: string) {
  const [{ n }] = await db.execute<{ n: number }>(sql`select count(*)::int as n from observations where project_id = ${projectId} and type = 'claim_check'`);
  if (n > 0) return { skipped: "already checked", claims: n };
  const rows = await db.select().from(observations).where(and(eq(observations.projectId, projectId), inArray(observations.type, ["transcript_turn", ...SEEN]))).orderBy(asc(observations.eventTime));
  const turns = rows.filter((r) => r.type === "transcript_turn").slice(0, MAX_TURNS).map((r, i) => ({ ref: `T${i + 1}`, row: r, text: String((r.payload as { text?: string }).text ?? "") }));
  const seen = rows
    .filter((r) => r.type !== "transcript_turn" && !(r.type === "responder_count" && !(r.payload as { responders?: number }).responders))
    .slice(0, MAX_EVIDENCE)
    .map((r, i) => ({ ref: `E${i + 1}`, row: r, text: evidenceText(r.type, r.payload as Record<string, unknown>) }));
  if (!turns.length || !seen.length) return { skipped: "needs speech and evidence", claims: 0 };

  const proposals = await proposeClaims(turns, seen);
  const { kept, dropped } = await traced(
    { kind: "code", name: "claims.verify", input: { proposed: proposals.length, turns: turns.length, evidence: seen.length }, output: (r) => ({ kept: r.kept.length, dropped: r.dropped }) },
    async () => checkClaims(proposals, new Map(turns.map((t) => [t.ref, t.text])), new Set(seen.map((e) => e.ref))),
  );
  const turnRow = new Map(turns.map((t) => [t.ref, t.row]));
  const evidence = new Map(seen.map((e) => [e.ref, e]));
  const ids = await traced(
    { kind: "code", name: "observations.write", input: { claims: kept.length, dropped: dropped.length }, output: (r: string[]) => ({ written: r.length }), observations: (r) => r },
    async () => {
      const out: string[] = [];
      for (const k of kept) {
        const t = turnRow.get(k.turn)!;
        const tp = t.payload as { at?: string; at_ms?: number; speaker?: string };
        out.push((await recordObservation({
          projectId, uploadId: t.uploadId, type: "claim_check", eventTime: t.eventTime, confidence: null,
          payload: {
            claim: k.claim, quote: k.quote, status: k.status, reason: k.reason, speaker: tp.speaker ?? "Unknown", at: tp.at ?? "", at_ms: tp.at_ms ?? 0,
            evidence: k.evidence.map((e) => evidence.get(e)!.row.id), evidence_text: k.evidence.map((e) => evidence.get(e)!.text), title: `${k.status}: ${k.claim}`,
          },
          provenance: { connector: "claims", producer: MODEL_ID(), verdicts: "code", turn: t.id, downgraded: k.downgraded, estimate: true },
        })).id);
      }
      return out;
    },
  );
  return { claims: ids.length, dropped: dropped.length };
}
