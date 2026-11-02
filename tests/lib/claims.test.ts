import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs, observations, projectProducts, traces } from "@/db/schema";
import { HANDLERS } from "@/lib/job-handlers";
import { recordObservation } from "@/lib/observations";
import { withTrace } from "@/lib/trace";
import { checkProjectClaims, CLAIMS_PRODUCT, queueClaims } from "@/sources/claims";
import { reset, seedProject } from "../db";
import { modelCalls, scriptModel } from "../fakes";

beforeEach(reset);

const T0 = new Date("2026-10-20T09:00:00Z");

async function project(opts: { on?: boolean; turns?: boolean; seen?: boolean } = {}) {
  const { project } = await seedProject();
  if (opts.on !== false) await db.insert(projectProducts).values({ projectId: project.id, productId: CLAIMS_PRODUCT });
  const add = (type: string, ms: number, payload: Record<string, unknown>) => recordObservation({ projectId: project.id, type, eventTime: new Date(T0.getTime() + ms), payload: { at_ms: ms, at: "00:0" + ms / 1000, ...payload } });
  if (opts.turns !== false) {
    await add("transcript_turn", 1000, { text: "The truck hit three cars on the freeway.", speaker: "A" });
    await add("transcript_turn", 3000, { text: "The driver was on drugs.", speaker: "A" });
  }
  if (opts.seen !== false) {
    await add("video_incident", 2000, { kind: "impact", description: "A truck strikes stopped cars" });
    await add("responder_count", 4000, { vehicles: 0, people: 0, responders: 0 });
    await add("responder_count", 5000, { vehicles: 2, people: 1, responders: 3 });
  }
  return project;
}
const claims = (projectId: string) => db.select().from(observations).where(eq(observations.projectId, projectId)).then((r) => r.filter((o) => o.type === "claim_check"));

describe("queueClaims", () => {
  test("queues once, when the product is on and both speech and evidence exist", async () => {
    const p = await project();
    expect(await queueClaims(p.id)).toBe(true);
    expect(await queueClaims(p.id)).toBe(false);
    expect(await db.select().from(jobs).where(eq(jobs.kind, "check_claims"))).toHaveLength(1);
    expect(await queueClaims((await project({ on: false })).id)).toBe(false);
    expect(await queueClaims((await project({ turns: false })).id)).toBe(false);
    expect(await queueClaims((await project({ seen: false })).id)).toBe(false);
  });
});

describe("checkProjectClaims", () => {
  test("writes checked claims; cause claims stay not shown and made-up evidence is downgraded", async () => {
    const p = await project();
    scriptModel({ claims: [
      { turn: "T1", claim: "A truck hit cars", quote: "hit three cars", verdict: "supported", evidence: ["E1"], reason: "Impact seen" },
      { turn: "T2", claim: "Driver on drugs", quote: "on drugs", verdict: "supported", evidence: ["E9"], reason: "made up" },
      { turn: "T7", claim: "ghost", quote: "x", verdict: "supported", evidence: ["E1"], reason: "none" },
    ] });
    const out = await withTrace({ projectId: p.id }, () => checkProjectClaims(p.id));
    expect(out).toMatchObject({ claims: 2, dropped: 1 });
    const rows = (await claims(p.id)).sort((a, b) => (a.payload as { at_ms: number }).at_ms - (b.payload as { at_ms: number }).at_ms);
    expect(rows[0].payload).toMatchObject({ status: "shown", title: "shown: A truck hit cars" });
    expect((rows[0].payload as { evidence: string[] }).evidence).toHaveLength(1);
    expect(rows[1].payload).toMatchObject({ status: "not shown", evidence: [] });
    expect(rows[1].provenance).toMatchObject({ downgraded: true, verdicts: "code" });
    // The empty responder count was not offered as evidence: E1 is the impact, E2 the 3 responders.
    expect(JSON.stringify(modelCalls[0])).not.toContain("0 emergency vehicles and 0 responders");
    expect((await db.select().from(traces)).map((t) => t.name)).toEqual(expect.arrayContaining(["claims.propose", "claims.verify", "observations.write"]));
  });

  test("is safe to run again and does nothing without both sides", async () => {
    const p = await project();
    scriptModel({ claims: [{ turn: "T1", claim: "c", quote: "hit three cars", verdict: "unverifiable", evidence: [], reason: "r" }] });
    await checkProjectClaims(p.id);
    expect(await checkProjectClaims(p.id)).toMatchObject({ skipped: "already checked" });
    const bare = await project({ seen: false });
    expect(await checkProjectClaims(bare.id)).toMatchObject({ skipped: "needs speech and evidence" });
  });

  test("the job handler runs it", async () => {
    const p = await project();
    scriptModel({ claims: [] });
    expect(await HANDLERS.check_claims({ projectId: p.id, payload: {} } as never)).toMatchObject({ claims: 0 });
  });
});
