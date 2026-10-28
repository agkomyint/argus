import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "@/db";
import { jobs, observations, projectProducts, traces, uploads } from "@/db/schema";
import { createLane } from "@/lib/lane-links";
import { loadStudioTimeline } from "@/lib/studio-timeline";
import { reset, seedProject } from "../db";

beforeEach(reset);

const T0 = new Date("2026-05-01T10:00:00Z").getTime();
const at = (s: number) => new Date(T0 + s * 1000);

async function setup() {
  const s = await seedProject();
  const projectId = s.project.id;
  let k = 0;
  const upload = async (over: Partial<typeof uploads.$inferInsert> = {}) => {
    const [u] = await db.insert(uploads).values({ projectId, userId: s.user.id, key: `${projectId}/u${k++}.jpg`, filename: `photo${k}.jpg`, contentType: "image/jpeg", size: 10, status: "ready", ...over }).returning();
    return u;
  };
  const job = async (over: Partial<typeof jobs.$inferInsert> = {}) => (await db.insert(jobs).values({ projectId, kind: "perception", ...over }).returning())[0];
  const trace = async (over: Partial<typeof traces.$inferInsert> = {}) =>
    (await db.insert(traces).values({ projectId, kind: "model", name: "perception.image", status: "ok", ms: 120, ...over }).returning())[0];
  const obs = async (over: Partial<typeof observations.$inferInsert> = {}) =>
    (await db.insert(observations).values({ projectId, type: "detection", eventTime: at(0), ...over }).returning())[0];
  return { ...s, projectId, upload, job, trace, obs };
}

describe("loadStudioTimeline", () => {
  test("an empty project has no lanes and no steps", async () => {
    const { projectId } = await setup();
    expect(await loadStudioTimeline(projectId, "owner")).toEqual({ lanes: [], other: [] });
  });

  test("files in a lane: waiting, reading, failed and done, joined to their steps and rows", async () => {
    const s = await setup();
    await db.insert(projectProducts).values({ projectId: s.projectId, productId: "object-detection-dataset" });
    const { lane } = await createLane(s.projectId, { name: "Site photos", analyzer: "objects" });
    const pending = await s.upload({ laneId: lane.id, status: "pending", createdAt: at(1) });
    const busy = await s.upload({ laneId: lane.id, createdAt: at(2) });
    const bad = await s.upload({ laneId: lane.id, createdAt: at(3) });
    const good = await s.upload({ laneId: lane.id, createdAt: at(4) });

    await s.job({ status: "running", payload: { uploadId: busy.id }, createdAt: at(5) });
    await s.job({ status: "failed", payload: { uploadId: bad.id }, createdAt: at(6) });
    const j = await s.job({ status: "done", payload: { uploadId: good.id }, createdAt: at(7), finishedAt: at(20) });
    const row = await s.obs({ uploadId: good.id, arrivalTime: at(12) });
    const extra = await s.obs({ uploadId: good.id, arrivalTime: at(25) });
    await s.trace({ jobId: j.id, model: "llama-4", tokensIn: 100, tokensOut: 20, observationIds: [row.id], createdAt: at(10) });
    await s.trace({ uploadId: good.id, kind: "code", name: "observations.write", model: null, tokensOut: 5, createdAt: at(11) });
    await s.trace({ uploadId: bad.id, status: "error", error: "x".repeat(200), createdAt: at(8) });

    const tl = await loadStudioTimeline(s.projectId, "owner");
    expect(tl.lanes).toHaveLength(1);
    const l = tl.lanes[0];
    expect(l).toMatchObject({ id: lane.id, name: "Site photos", input: "files", analyzer: "objects", feeds: ["object-detection-dataset"] });
    expect(l.locked).toBeUndefined();
    expect(l.items.map((i) => i.id)).toEqual([pending.id, busy.id, bad.id, good.id]);
    const [a, b, c, d] = l.items;
    expect(a).toMatchObject({ state: "waiting", kind: "file", label: pending.filename, steps: [], rows: [] });
    expect(b.state).toBe("reading");
    expect(c.state).toBe("failed");
    expect(c.steps[0]).toMatchObject({ ok: false, error: "x".repeat(160), tokens: null });
    expect(d.state).toBe("done");
    expect(d.steps.map((x) => [x.name, x.kind, x.model, x.tokens, x.wrote])).toEqual([["perception.image", "model", "llama-4", 120, 1], ["observations.write", "code", null, 5, 0]]);
    expect(d.rows.sort()).toEqual([row.id, extra.id].sort());
    expect(d.done).toBe(at(25).getTime());

    // Public: no filenames and no error text.
    const pub = await loadStudioTimeline(s.projectId, "public");
    expect(pub.lanes[0].items.map((i) => i.label)).toEqual(["File 1", "File 2", "File 3", "File 4"]);
    expect(pub.lanes[0].items[2].steps[0].error).toBeUndefined();
  });

  test("a step with nothing to tie it to goes to other", async () => {
    const s = await setup();
    await s.trace({ name: "lanes.suggest_one", createdAt: at(1) });
    const tl = await loadStudioTimeline(s.projectId, "owner");
    expect(tl.lanes).toEqual([]);
    expect(tl.other.map((x) => x.name)).toEqual(["lanes.suggest_one"]);
  });

  test("video frames sit in their video's lane, by job key, trace frame and Observation frame", async () => {
    const s = await setup();
    const { lane } = await createLane(s.projectId, { name: "Walk", analyzer: "objects" });
    const video = await s.upload({ laneId: lane.id, filename: "walk.mp4", contentType: "video/mp4", createdAt: at(0) });
    const key = `${s.projectId}/frames/${video.id}/000010000.jpg`;
    const key2 = `${s.projectId}/frames/${video.id}/000020000.jpg`;
    const j = await s.job({ status: "done", payload: { key, uploadId: video.id }, createdAt: at(3) });
    await s.trace({ jobId: j.id, output: { frame: key }, createdAt: at(4) });
    await s.obs({ provenance: { frame: key2 }, arrivalTime: at(6) });
    // A frame whose video is gone falls back to earlier files.
    await s.job({ status: "queued", payload: { key: `${s.projectId}/frames/00000000-0000-4000-8000-000000000000/000000500.jpg` }, createdAt: at(7) });
    // A job with nothing to point at is skipped.
    await s.job({ status: "done", payload: {}, createdAt: at(8) });

    const tl = await loadStudioTimeline(s.projectId, "owner");
    const walk = tl.lanes.find((l) => l.id === lane.id)!;
    expect(walk.items.map((i) => [i.kind, i.label])).toEqual([["file", "walk.mp4"], ["frame", "Frame at 00:10"], ["frame", "Frame at 00:20"]]);
    expect(walk.items[1].steps).toHaveLength(1);
    expect(walk.items[2].rows).toHaveLength(1);
    const early = tl.lanes.find((l) => l.id === "files")!;
    expect(early).toMatchObject({ name: "Earlier files", analyzer: "objects" });
    expect(early.items[0]).toMatchObject({ kind: "frame", label: "Frame at 00:00", state: "waiting" });
  });

  test("screen frames and screen-share readings without a screen lane get their own Screen share lane", async () => {
    const s = await setup();
    await s.trace({ name: "perception.people", output: { frame: `${s.projectId}/capture/a.jpg` }, createdAt: at(1) });
    await s.obs({ provenance: { connector: "screen-share" }, arrivalTime: at(65) });
    // An Observation tied to nothing is left out.
    await s.obs({ arrivalTime: at(66) });

    const tl = await loadStudioTimeline(s.projectId, "owner");
    expect(tl.lanes).toHaveLength(1);
    expect(tl.lanes[0]).toMatchObject({ id: "screen", name: "Screen share", input: "screen", analyzer: "screen" });
    expect(tl.lanes[0].items.map((i) => [i.kind, i.label])).toEqual([["frame", "Screen frame"], ["reading", "Readings 10:01"]]);
  });

  test("a live lane gets its readings by source, a minute at a time, and screen frames go to the screen lane", async () => {
    const s = await setup();
    const { lane: screen } = await createLane(s.projectId, { name: "Cam", analyzer: "screen", input: "screen" });
    const { lane: sensor, source } = await createLane(s.projectId, { name: "Strain", analyzer: "objects", input: "sensor_sim" });
    await s.obs({ sourceId: source!.id, arrivalTime: at(5) });
    await s.obs({ sourceId: source!.id, arrivalTime: at(30) });
    await s.obs({ sourceId: source!.id, arrivalTime: at(70) });
    await s.obs({ provenance: { connector: "screen-share" }, arrivalTime: at(10) });
    await s.trace({ output: { frame: `${s.projectId}/capture/b.jpg` }, createdAt: at(2) });

    const tl = await loadStudioTimeline(s.projectId, "owner");
    expect(tl.lanes.map((l) => l.id)).toEqual([screen.id, sensor.id]);
    const live = tl.lanes[1];
    expect(live.items.map((i) => [i.label, i.rows.length, i.state])).toEqual([["Readings 10:00", 2, "done"], ["Readings 10:01", 1, "done"]]);
    expect(tl.lanes[0].items.map((i) => i.kind)).toEqual(["reading", "frame"]); // a reading sits at the start of its minute
  });

  test("body check-ins are locked in public, both in a body lane and in earlier files", async () => {
    const s = await setup();
    const { lane } = await createLane(s.projectId, { name: "Front pics", analyzer: "body" });
    await s.upload({ laneId: lane.id, createdAt: at(1) });
    await s.upload({ laneId: lane.id, createdAt: at(2) });
    const old = await s.upload({ createdAt: at(0) });
    await s.trace({ uploadId: old.id, name: "body.checkin", createdAt: at(3) });

    const owner = await loadStudioTimeline(s.projectId, "owner");
    expect(owner.lanes.every((l) => !l.locked)).toBe(true);
    expect(owner.lanes[1]).toMatchObject({ id: "files", analyzer: "body" });

    const pub = await loadStudioTimeline(s.projectId, "public");
    expect(pub.lanes.map((l) => [l.id, l.locked])).toEqual([[lane.id, true], ["files", true]]);
    expect(pub.lanes[0].items.map((i) => i.label)).toEqual(["Check-in 1", "Check-in 2"]);
    expect(pub.lanes[1].items[0].label).toBe("Check-in 1");
  });

  test("a step for a file no longer kept still shows", async () => {
    const s = await setup();
    const gone = await s.upload({ createdAt: at(0) });
    const t = await s.trace({ uploadId: gone.id, createdAt: at(1) });
    await db.delete(uploads);
    // The upload is gone, so the trace lost its link; tie a row to it by id instead.
    const o = await s.obs({ arrivalTime: at(2) });
    await db.update(traces).set({ observationIds: [o.id] });
    const tl = await loadStudioTimeline(s.projectId, "owner");
    expect(tl.other.map((x) => x.id)).toEqual([t.id]);
    expect(tl.lanes).toEqual([]);
  });
});
