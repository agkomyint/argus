import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs, observations, projectProducts, traces, uploads } from "@/db/schema";
import { dropKeptFrames } from "@/lib/capture";
import { processUpload } from "@/lib/connectors";
import { HANDLERS } from "@/lib/job-handlers";
import { traced, withTrace } from "@/lib/trace";
import { analyzeVideoFrame, dropVideoFrames, storeVideoFrame } from "@/sources/video";
import { clock, framePlan, isVideoFile, MAX_FRAMES } from "@/sources/video-plan";
import { reset, seedProject } from "../db";
import { putFile, s3Store, scriptModel } from "../fakes";

beforeEach(reset);

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

async function video(projectId: string, userId: string, filename = "lobby.mp4") {
  const key = `u/${crypto.randomUUID()}/${filename}`;
  putFile(key, "not really a video");
  const [u] = await db
    .insert(uploads)
    .values({ projectId, userId, key, filename, contentType: "video/mp4", size: 18, status: "ready", createdAt: new Date("2026-10-20T09:00:00Z") })
    .returning();
  return u;
}

describe("video plan", () => {
  test("samples every 2 s and never past MAX_FRAMES", () => {
    expect(framePlan(10_000)).toMatchObject({ everyMs: 2000, count: 5, atMs: [0, 2000, 4000, 6000, 8000] });
    expect(framePlan(10_001).count).toBe(6);
    const long = framePlan(3_600_000);
    expect(long.count).toBe(MAX_FRAMES);
    expect(long.everyMs).toBe(60_000);
    expect(framePlan(0).count).toBe(0);
  });

  test("clock and file type", () => {
    expect(clock(42_000)).toBe("00:42");
    expect(clock(3_725_000)).toBe("1:02:05");
    expect(isVideoFile("A.MOV")).toBe(true);
    expect(isVideoFile("a.jpg")).toBe(false);
  });
});

describe("video source", () => {
  test("processUpload leaves video to the browser sampler", async () => {
    const { user, project } = await seedProject();
    const up = await video(project.id, user.id);
    expect(await processUpload(up.id)).toEqual({ video: true, frames: "sampled in the browser" });
  });

  test("a browser frame is stored, becomes a video_frame Observation at its second, and is queued", async () => {
    const { user, project } = await seedProject();
    const up = await video(project.id, user.id);
    const stored = await withTrace({ projectId: project.id, uploadId: up.id }, () => storeVideoFrame(up, 42_000, JPEG));
    expect(stored).not.toBeNull();
    expect(s3Store.get(stored!.key)).toEqual(JPEG);

    const [o] = await db.select().from(observations).where(eq(observations.id, stored!.observationId));
    expect(o).toMatchObject({ type: "video_frame", uploadId: up.id, payload: { at_ms: 42_000, at: "00:42" } });
    expect(o.eventTime.toISOString()).toBe("2026-10-20T09:00:42.000Z");
    expect(o.provenance).toMatchObject({ connector: "video-upload", sampler: "browser", frame: stored!.key });

    const [job] = await db.select().from(jobs);
    expect(job).toMatchObject({ kind: "analyze_video_frame", payload: { uploadId: up.id, key: stored!.key, atMs: 42_000 } });

    const [t] = await db.select().from(traces);
    expect(t).toMatchObject({ kind: "code", name: "video.store_frame", status: "ok", projectId: project.id, uploadId: up.id, observationIds: [o.id] });
    expect(t.input).toMatchObject({ image: { bytes: 4 } });
  });

  test("stops at MAX_FRAMES per video", async () => {
    const { user, project } = await seedProject();
    const up = await video(project.id, user.id);
    await db.insert(observations).values(Array.from({ length: MAX_FRAMES }, (_, i) => ({ projectId: project.id, uploadId: up.id, type: "video_frame", eventTime: new Date(), payload: { at_ms: i } })));
    expect(await storeVideoFrame(up, 0, JPEG)).toBeNull();
  });

  test("the frame job runs the models and writes findings at that second, all traced", async () => {
    const { user, project } = await seedProject();
    await db.insert(projectProducts).values({ projectId: project.id, productId: "people-count" });
    const up = await video(project.id, user.id);
    const stored = await withTrace({ projectId: project.id, uploadId: up.id }, () => storeVideoFrame(up, 4000, JPEG));
    scriptModel({ people: 3, female: 0, male: 0, unclear: 0 }, { findings: [{ label: "trolley", kind: "object", confidence: 0.7, description: "A trolley by the door" }] });

    const [job] = await db.select().from(jobs);
    const result = await withTrace({ projectId: project.id }, () => HANDLERS.analyze_video_frame({ ...job, projectId: project.id } as never));
    expect(result).toEqual({ at: "00:04", people: 3, findings: 1, observations: 2 });

    const rows = await db.select().from(observations).where(eq(observations.uploadId, up.id));
    const count = rows.find((r) => r.type === "people_count")!;
    expect(count.payload).toMatchObject({ count: 3, at: "00:04" });
    expect(count.eventTime.toISOString()).toBe("2026-10-20T09:00:04.000Z");
    expect(rows.find((r) => r.type === "object_detected")?.provenance).toMatchObject({ connector: "video-upload", producer: "test-model", estimate: true, frame: stored!.key });

    const names = (await db.select().from(traces).where(eq(traces.uploadId, up.id))).map((t) => t.name).sort();
    expect(names).toEqual(["observations.write", "perception.image", "perception.scene", "video.store_frame"]);
  });

  test("a frame of a removed video is skipped", async () => {
    const { project } = await seedProject();
    expect(await analyzeVideoFrame(project.id, { uploadId: crypto.randomUUID(), key: "k", atMs: 0 })).toEqual({ skipped: "the video was removed" });
  });

  test("deleting a video drops its frames; screen-share cleanup leaves them", async () => {
    const { user, project } = await seedProject();
    const up = await video(project.id, user.id);
    const stored = await storeVideoFrame(up, 0, JPEG);
    await dropKeptFrames(project.id);
    expect(s3Store.has(stored!.key)).toBe(true);
    expect(await dropVideoFrames(up.id)).toBe(1);
    expect(s3Store.has(stored!.key)).toBe(false);
    const [o] = await db.select().from(observations).where(eq(observations.uploadId, up.id));
    expect(o.provenance).not.toHaveProperty("frame");
  });

  test("a storage delete that fails never stops the cleanup", async () => {
    const { user, project } = await seedProject();
    const up = await video(project.id, user.id);
    await storeVideoFrame(up, 0, JPEG);
    await db.insert(observations).values({ projectId: project.id, type: "people_count", eventTime: new Date(), provenance: { connector: "screen-share", frame: "cap/a.jpg" } });
    const del = s3Store.delete;
    s3Store.delete = () => { throw new Error("storage down"); };
    try {
      expect(await dropVideoFrames(up.id)).toBe(1);
      expect(await dropKeptFrames(project.id)).toBe(1);
    } finally {
      s3Store.delete = del;
    }
    const rows = await db.select().from(observations).where(eq(observations.projectId, project.id));
    expect(rows.every((r) => !("frame" in r.provenance))).toBe(true);
  });
});

describe("observatory", () => {
  test("a failed step is recorded with its error and re-thrown", async () => {
    const { project } = await seedProject();
    const boom = () => traced({ kind: "model", name: "boom", model: "m", input: { a: 1 } }, async () => Promise.reject(new Error("no")));
    await expect(withTrace({ projectId: project.id }, boom)).rejects.toThrow("no");
    const [t] = await db.select().from(traces);
    expect(t).toMatchObject({ name: "boom", status: "error", error: "no", projectId: project.id, input: { a: 1 } });
  });

  test("long text and bytes are kept small", async () => {
    await traced({ kind: "code", name: "big", input: { text: "x".repeat(5000), image: new Uint8Array(9000) } }, async () => 1);
    const [t] = await db.select().from(traces);
    expect((t.input as { text: string }).text.length).toBeLessThan(1300);
    expect((t.input as { image: unknown }).image).toEqual({ bytes: 9000 });
  });

  test("a trace that cannot be written never breaks the work", async () => {
    // A project id that does not exist fails the foreign key; the step still returns.
    expect(await withTrace({ projectId: crypto.randomUUID() }, () => traced({ kind: "code", name: "x" }, async () => 7))).toBe(7);
  });
});
