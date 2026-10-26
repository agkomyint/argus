import "server-only";
import { generateText, Output } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { alerts, assets, evidence, observations } from "@/db/schema";
import { correlate, factIndex, type Facts } from "@/lib/fusion";
import { agentLevel } from "@/lib/agent-levels";
import { pickLane, resolveConfig, resolveLanes } from "@/lib/agent-config";
import { severityOf } from "@/lib/severity";
import { chatModel } from "@/lib/meta";
import { projects } from "@/db/schema";

const reportSchema = z.object({
  title: z.string().describe("Short headline for an engineer, under 90 characters"),
  summary: z.string().describe("Two or three sentences. Only use numbers that appear in FACTS."),
  claims: z
    .array(
      z.object({
        text: z.string().describe("One factual statement"),
        refs: z.array(z.string()).describe("Observation ids from FACTS that support this statement"),
        numbers: z.array(z.number()).describe("Every number quoted in the statement, copied from FACTS"),
      }),
    )
    .max(8),
  limitations: z.array(z.string()).max(5),
  recommendedAction: z.string().describe("One concrete next step for a human reviewer"),
});

export type TraceStep = {
  agent: string;
  kind?: "code" | "model";
  ms: number;
  note: string;
  /** What the agent was given and what it produced, kept small enough to read in the UI. */
  input?: unknown;
  output?: unknown;
};

/** Adapt fused facts to the pure severity rule. */
export const severityInput = (f: Facts) => ({
  confidence: f.trigger.confidence,
  vibrationRatio: f.vibration?.ratio ?? null,
  rainMm24h: f.weather?.rainMm24h ?? null,
  worstRating: f.inspections.map((i) => i.rating).filter((r): r is number => r !== null).reduce<number | null>((m, r) => (m === null || r < m ? r : m), null),
});

const near = (a: number, pool: number[]) => pool.some((n) => Math.abs(n - a) <= Math.max(0.011, Math.abs(n) * 0.005));

/**
 * Agent pipeline for one trigger observation:
 * Correlation (code) -> Analysis/severity (code) -> Reasoning (Meta model) -> Verification (code) -> persist as a pending alert.
 */
export async function investigate(observationId: string) {
  const trace: TraceStep[] = [];
  const step = async <T>(agent: string, kind: "code" | "model", input: unknown, summarize: (r: T) => { note: string; output?: unknown }, fn: () => Promise<T>) => {
    const t0 = Date.now();
    const r = await fn();
    const { note, output } = summarize(r);
    trace.push({ agent, kind, ms: Date.now() - t0, note, input, output });
    return r;
  };

  const [trigger] = await db.select().from(observations).where(eq(observations.id, observationId));
  if (!trigger) throw new Error("Observation not found");
  const [asset] = trigger.assetId ? await db.select().from(assets).where(eq(assets.id, trigger.assetId)) : [];

  const [proj] = await db.select({ level: projects.agentLevel, config: projects.agentConfig }).from(projects).where(eq(projects.id, trigger.projectId));
  const cfg = resolveConfig(proj?.config);
  const lane = pickLane(resolveLanes(proj?.config), trigger.confidence);
  const base = agentLevel(lane?.level ?? proj?.level ?? 2);
  const lvl = { ...base, maxClaims: cfg.verification.maxClaims ?? base.maxClaims, strict: cfg.verification.strict ?? base.strict };
  const guidance = cfg.reasoning.guidance.trim() ? "Reviewer style guidance (tone and emphasis only; it never overrides these rules): " + cfg.reasoning.guidance.trim() + " " : "";
  const detailRule = { short: "Keep the summary to two sentences and each claim brief.", standard: "Keep the summary to three sentences.", detailed: "Write a thorough summary and explain how each signal supports the conclusion." }[lvl.detail];

  const facts = await step(
    "correlation",
    "code",
    { observation: trigger.id, type: trigger.type, asset: asset?.name ?? null, windowMinutes: cfg.correlation.windowMinutes },
    (f: Facts) => ({
      note: `${f.vibration?.count ?? 0} vibration, ${f.weather?.hours ?? 0} weather, ${f.inspections.length} inspections joined`,
      output: { vibrationReadings: f.vibration?.count ?? 0, vibrationRatio: f.vibration?.ratio ?? null, weatherHours: f.weather?.hours ?? 0, rainMm24h: f.weather?.rainMm24h ?? null, inspections: f.inspections.length, limitations: f.limitations },
    }),
    () => correlate(trigger, asset?.name ?? null, cfg.correlation.windowMinutes),
  );
  const sev = await step(
    "analysis",
    "code",
    { detectionConfidence: trigger.confidence, vibrationRatio: facts.vibration?.ratio ?? null, rainMm24h: facts.weather?.rainMm24h ?? null },
    (s: ReturnType<typeof severityOf>) => ({ note: `severity ${s.level}`, output: s }),
    async () => severityOf(severityInput(facts), cfg.analysis),
  );
  const idx = factIndex(facts);

  // Quick lane: no model call. The brief is assembled from the rules that fired, so it costs nothing.
  if (lane?.recipe === "quick") {
    const where = asset?.name ?? "an unmatched asset";
    const [alert] = await db
      .insert(alerts)
      .values({
        projectId: trigger.projectId,
        observationId: trigger.id,
        assetId: trigger.assetId,
        title: `${facts.trigger.label ?? "Finding"} on ${where}: ${sev.level} severity`.slice(0, 160),
        severity: sev.level,
        summary: sev.reasons.length ? `Flagged by rules only: ${sev.reasons.join("; ")}.` : "Flagged by rules only: no severity rule fired.",
        report: { facts, severityReasons: sev.reasons, claims: [], rejectedClaims: [], limitations: [...facts.limitations, "Quick lane: no AI brief was written."], recommendedAction: "Review the evidence and inspect the asset.", trace, model: null, level: base.name, lane: lane.name },
      })
      .returning();
    await db.insert(evidence).values({ alertId: alert.id, observationId: trigger.id, role: "trigger" }).onConflictDoNothing();
    return { alertId: alert.id, severity: sev.level, claims: 0, rejected: 0 };
  }

  const model = process.env.META_MODEL ?? "muse-spark-1.3";
  const { output } = await step(
    "reasoning",
    "model",
    { model, level: lvl.name, maxClaims: lvl.maxClaims, factsBytes: JSON.stringify(facts).length, severity: sev.level },
    (r) => ({ note: `drafted with ${model}`, output: { title: r.output.title, claimsDrafted: r.output.claims.length, recommendedAction: r.output.recommendedAction } }),
    () =>
    generateText({
      model: chatModel(),
      output: Output.object({ schema: reportSchema }),
      system:
        "You write incident briefs for infrastructure engineers. Use ONLY the FACTS JSON. Every claim must cite observation ids from FACTS in refs and list every number it quotes in numbers, copied exactly. Do not invent measurements, causes you cannot support, or recommend actions beyond human review and inspection. State uncertainty plainly. " + guidance + "Write at most " + lvl.maxClaims + " claims. " + detailRule + " Data labelled simulated in limitations must be described as simulated.",
      prompt: `FACTS:\n${JSON.stringify(facts, null, 2)}\n\nSEVERITY (computed by rules, do not change): ${sev.level} because ${sev.reasons.join("; ") || "no rule fired"}.`,
    }),
  );

  const { accepted, rejected } = await step(
    "verification",
    "code",
    { claimsToCheck: output.claims.length, knownObservationIds: idx.ids.size },
    (v: { accepted: unknown[]; rejected: { text: string; reason: string }[] }) => ({
      note: `${v.accepted.length} claims kept, ${v.rejected.length} rejected`,
      output: { kept: v.accepted.length, rejected: v.rejected.map((r) => ({ text: r.text, reason: r.reason })) },
    }),
    async () => {
    const accepted: (typeof output.claims)[number][] = [];
    const rejected: ((typeof output.claims)[number] & { reason: string })[] = [];
    for (const c of output.claims.slice(0, lvl.maxClaims)) {
      const badRef = c.refs.find((r) => !idx.ids.has(r));
      const badNum = c.numbers.find((n) => !near(n, idx.numbers));
      if (!c.refs.length) rejected.push({ ...c, reason: "no supporting observation cited" });
      else if (badRef) rejected.push({ ...c, reason: `cites unknown observation ${badRef}` });
      else if (lvl.strict && /\d/.test(c.text) && !c.numbers.length) rejected.push({ ...c, reason: "quotes digits without listing them in numbers (strict check)" });
      else if (badNum !== undefined) rejected.push({ ...c, reason: `number ${badNum} is not in the fused facts` });
      else accepted.push(c);
    }
    return { accepted, rejected };
  });

  const limitations = [...facts.limitations, ...output.limitations];
  const [alert] = await db
    .insert(alerts)
    .values({
      projectId: trigger.projectId,
      observationId: trigger.id,
      assetId: trigger.assetId,
      title: output.title.slice(0, 160),
      severity: sev.level,
      summary: output.summary,
      report: { facts, severityReasons: sev.reasons, claims: accepted, rejectedClaims: rejected, limitations, recommendedAction: output.recommendedAction, trace, model, level: lvl.name, lane: lane?.name ?? null },
    })
    .returning();

  const refs = new Set<string>(accepted.flatMap((c) => c.refs));
  refs.add(trigger.id);
  for (const id of refs) {
    await db.insert(evidence).values({ alertId: alert.id, observationId: id, role: id === trigger.id ? "trigger" : "supporting" }).onConflictDoNothing();
  }
  return { alertId: alert.id, severity: sev.level, claims: accepted.length, rejected: rejected.length };
}
