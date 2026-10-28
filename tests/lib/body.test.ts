import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs, observations, sourceLanes, timelines, uploads } from "@/db/schema";
import { BODY_PRODUCTS, clearChange, latestPerDay, progressOf, score, streakOf, type BodyCheck } from "@/lib/body-math";
import { bodyCheck } from "@/lib/body-check";
import { processUpload } from "@/lib/connectors";
import { forgetBodyPhoto } from "@/lib/fusion";
import { HANDLERS } from "@/lib/job-handlers";
import { getProduct } from "@/products";
import { getWidget } from "@/widgets/registry";
import { reset, seedProject } from "../db";
import { modelCalls, putFile, scriptModel } from "../fakes";

const none = { abs: null, chest: null, arms: null, shoulders: null, legs: null, back: null };
const check = (day: string, abs: number, over: Partial<BodyCheck> = {}): BodyCheck => ({ day, t: Date.parse(`${day}T12:00:00Z`), comparable: true, scores: { ...none, abs }, ...over });

describe("body maths", () => {
  test("scores clamp to 1..10 and 0 means not visible", () => {
    expect([score(0), score(1), score(7.4), score(12), score("x"), score(-3)]).toEqual([null, 1, 7, 10, null, null]);
  });

  test("a one-point move is within the model's repeat noise", () => {
    expect([clearChange(1), clearChange(-1), clearChange(0), clearChange(null), clearChange(2), clearChange(-3)]).toEqual([false, false, false, false, true, true]);
  });

  test("the latest photo of a day wins", () => {
    const d = latestPerDay([check("2026-10-02", 4), check("2026-10-01", 3), { ...check("2026-10-02", 6), t: Date.parse("2026-10-02T20:00:00Z") }]);
    expect(d.map((c) => [c.day, c.scores.abs])).toEqual([["2026-10-01", 3], ["2026-10-02", 6]]);
  });

  test("the streak ends at the last logged day and a gap breaks it", () => {
    expect(streakOf([])).toBe(0);
    expect(streakOf(["2026-10-01", "2026-10-02", "2026-10-04", "2026-10-05", "2026-10-06"])).toBe(3);
    expect(streakOf(["2026-10-01", "2026-10-01", "bad"])).toBe(1);
  });

  test("change is measured against day 1 and the last comparable day only", () => {
    const checks = [check("2026-10-01", 3), check("2026-10-02", 4), check("2026-10-03", 9, { comparable: false }), check("2026-10-04", 5)];
    expect(progressOf(checks, "2026-10-01")).toMatchObject({ baseline_day: "2026-10-01", vs_day1: null, days_logged: 1, streak: 1 });
    expect(progressOf(checks, "2026-10-03")).toMatchObject({ comparable: false, vs_day1: null, vs_prev: null });
    const today = progressOf(checks, "2026-10-04")!;
    expect(today.vs_day1?.abs).toBe(2);
    expect(today.prev_day).toBe("2026-10-02");
    expect(today.vs_prev?.abs).toBe(1);
    expect(today.vs_day1?.legs).toBeNull();
    expect(today.streak).toBe(4);
    expect(progressOf(checks, "2026-09-30")).toBeNull();
  });
});

test("body products are registered with their widgets", () => {
  for (const id of BODY_PRODUCTS) {
    const p = getProduct(id);
    expect(p?.status).toBe("supported");
    expect(getWidget(p!.widget!.id)).toBeDefined();
  }
});

describe("daily check-in pipeline", () => {
  beforeEach(reset);

  const reply = (abs: number, comparable = true) => ({ view: "front", lighting: "even", comparable, abs, chest: 4, arms: 0, shoulders: 5, legs: 0, back: 0, summary: "Front view, abs faintly visible." });

  async function setup() {
    const { project, user } = await seedProject();
    const [tl] = await db.insert(timelines).values({ projectId: project.id, name: "Body" }).returning();
    const [lane] = await db.insert(sourceLanes).values({ projectId: project.id, timelineId: tl.id, name: "Front photo", analyzer: "body" }).returning();
    const add = async (takenOn: string | null) => {
      const key = `u/${crypto.randomUUID()}/front.jpg`;
      putFile(key, new Uint8Array([1, 2, 3]));
      const [u] = await db.insert(uploads).values({ projectId: project.id, userId: user.id, key, filename: "front.jpg", contentType: "image/jpeg", size: 3, status: "ready", laneId: lane.id, timelineId: tl.id, takenOn }).returning();
      return u;
    };
    return { project, lane, add };
  }

  test("a body lane skips detection and queues a check-in", async () => {
    const { project, add } = await setup();
    const u = await add("2026-10-01");
    expect(await processUpload(u.id)).toMatchObject({ body_check: true, detections: 0 });
    expect(modelCalls).toHaveLength(0);
    await HANDLERS.process_upload({ payload: { uploadId: u.id }, projectId: project.id } as never);
    expect((await db.select().from(jobs)).map((j) => j.kind)).toContain("body_check");
  });

  test("the body_check job runs the check-in for its upload", async () => {
    const { project, add } = await setup();
    const u = await add("2026-10-01");
    scriptModel(reply(3));
    expect(await HANDLERS.body_check({ id: "j", projectId: project.id, payload: { uploadId: u.id } })).toMatchObject({ day: "2026-10-01" });
  });

  test("day 1 then day 2: scores, the picked day, and change vs day 1", async () => {
    const { add } = await setup();
    const d1 = await add("2026-10-01");
    scriptModel(reply(3));
    expect(await bodyCheck(d1.id)).toMatchObject({ day: "2026-10-01", baseline: "2026-10-01" });
    expect(JSON.stringify(modelCalls[0])).toContain("this one becomes day 1");

    const d2 = await add("2026-10-02");
    scriptModel(reply(5));
    await bodyCheck(d2.id);
    // Day 1's photo goes along as the second image.
    expect(JSON.stringify(modelCalls[1])).toContain("day 1 photo from 2026-10-01");

    const rows = await db.select().from(observations).where(eq(observations.type, "body_progress"));
    const last = rows.find((r) => (r.payload as { day: string }).day === "2026-10-02")!;
    expect(last.eventTime.toISOString()).toBe("2026-10-02T12:00:00.000Z");
    expect(last.payload).toMatchObject({ abs: 5, arms: null, vs_day1: { abs: 2, arms: null }, days_logged: 2, streak: 2, baseline_upload_id: d1.id });
    const view = (await db.select().from(observations).where(eq(observations.type, "body_view"))).find((r) => r.uploadId === d2.id)!;
    expect(view.provenance).toMatchObject({ connector: "body-check", estimate: true });
  });

  test("a shot that does not match day 1 is kept but not counted", async () => {
    const { add } = await setup();
    scriptModel(reply(3));
    await bodyCheck((await add("2026-10-01")).id);
    scriptModel(reply(9, false));
    await bodyCheck((await add("2026-10-02")).id);
    const [p] = (await db.select().from(observations).where(eq(observations.type, "body_progress"))).filter((r) => (r.payload as { day: string }).day === "2026-10-02");
    expect(p.payload).toMatchObject({ comparable: false, vs_day1: null, abs: 9 });
  });

  test("checking the same photo again replaces its rows", async () => {
    const { add } = await setup();
    const u = await add("2026-10-01");
    scriptModel(reply(3), reply(4));
    await bodyCheck(u.id);
    await bodyCheck(u.id);
    const rows = await db.select().from(observations).where(eq(observations.uploadId, u.id));
    expect(rows.map((r) => r.type).sort()).toEqual(["body_progress", "body_view"]);
    expect((rows[0].payload as { abs: number }).abs).toBe(4);
  });

  test("deleting day 1's photo removes its check-in and measures the rest from the new day 1", async () => {
    const { project, add } = await setup();
    const d1 = await add("2026-10-01");
    scriptModel(reply(3));
    await bodyCheck(d1.id);
    const d2 = await add("2026-10-02");
    scriptModel(reply(5));
    await bodyCheck(d2.id);
    expect(await forgetBodyPhoto(project.id, d1.id)).toEqual({ removed: 2, remeasured: 1 });
    const rows = await db.select().from(observations).where(eq(observations.type, "body_progress"));
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toMatchObject({ day: "2026-10-02", baseline_day: "2026-10-02", vs_day1: null, days_logged: 1 });
  });
});

test("public product rows never point at body photos, or at any file when media is not shared", async () => {
  const { publicDatasets } = await import("@/lib/explore");
  const row = (type: string, payload: Record<string, unknown>) => ({ type, total: 1, latest: 1, rows: [{ id: "o", type, t: 1, arrived: 1, payload, confidence: null }] });
  const [body, det] = publicDatasets([row("body_progress", { abs: 4, upload_id: "u1", baseline_upload_id: "u0", file: "me.jpg" }), row("object_detected", { label: "car", upload_id: "u2", file: "a.jpg" })], true);
  expect(body.rows[0].payload).toEqual({ abs: 4 });
  expect(det.rows[0].payload).toMatchObject({ upload_id: "u2" });
  expect(publicDatasets([row("object_detected", { label: "car", upload_id: "u2", file: "a.jpg" })], false)[0].rows[0].payload).toEqual({ label: "car" });
});
