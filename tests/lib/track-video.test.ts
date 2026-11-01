import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs, observations, traces, uploads } from "@/db/schema";
import { HANDLERS } from "@/lib/job-handlers";
import { createLane } from "@/lib/lane-links";
import { withTrace } from "@/lib/trace";
import { storeVideoFrame, trackVideo } from "@/sources/video";
import { reset, seedProject } from "../db";
import { putFile, scriptModel } from "../fakes";

beforeEach(reset);

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const SIGN = await Bun.file(`${import.meta.dir}/../fixtures/sam-sign.txt`).text();
const [first, second] = SIGN.replace(/^<0f>/, "").split(/,(?=\d+<\|box)/);
const rec = (id: number, r: string) => r.replace(/^\d+/, String(id));
const CLIP = [`<0f>${rec(0, first)}`, `<1f>${rec(0, first)},${rec(7, second)}`, `<5f>${rec(0, first)}`].join("\n");

const realFetch = globalThis.fetch;
const asked: string[] = [];
afterEach(() => { globalThis.fetch = realFetch; });
function fakeSam(answer = CLIP) {
  process.env.META_API_KEY = "test-key";
  asked.length = 0;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    if (url.endsWith("/files")) return Response.json({ id: "file-1" });
    asked.push(JSON.stringify(init.body));
    return Response.json({ output: [{ content: [{ text: answer }] }], usage: { video_frames_processed: 60 } });
  }) as unknown as typeof fetch;
}

async function clip(read: "frames" | "clip") {
  const { user, project } = await seedProject();
  const { lane } = await createLane(project.id, { name: "Gym floor", analyzer: "objects", videoRead: read });
  const key = `u/${crypto.randomUUID()}/gym.mp4`;
  putFile(key, "not really a video");
  const [up] = await db.insert(uploads).values({ projectId: project.id, userId: user.id, laneId: lane.id, key, filename: "gym.mp4", contentType: "video/mp4", size: 18, status: "ready", createdAt: new Date("2026-10-20T09:00:00Z") }).returning();
  return { project, up };
}

const run = async (projectId: string, job: typeof jobs.$inferSelect) => {
  scriptModel({ findings: [{ label: "chair", kind: "object", confidence: 0.8, description: "A chair" }] });
  return HANDLERS.analyze_video_frame({ ...job, projectId } as never);
};
const analyzeJobs = () => db.select().from(jobs).where(eq(jobs.kind, "analyze_video_frame")).orderBy(jobs.createdAt);
const trackJobs = () => db.select().from(jobs).where(eq(jobs.kind, "track_video"));

describe("a lane that reads the whole clip", () => {
  test("the last frame queues one tracking job, and not before", async () => {
    const { project, up } = await clip("clip");
    await withTrace({ projectId: project.id, uploadId: up.id }, async () => {
      await storeVideoFrame(up, 0, JPEG, 2);
      await storeVideoFrame(up, 2000, JPEG, 2);
    });
    const [one, two] = await analyzeJobs();
    // Frame 1 is read while frame 2 is still waiting: not yet.
    await run(project.id, one);
    expect(await trackJobs()).toHaveLength(0);
    await db.update(jobs).set({ status: "done" }).where(eq(jobs.id, one.id));
    await run(project.id, two);
    expect(await trackJobs()).toHaveLength(1);
    // Reading the same last frame again does not queue a second job.
    await run(project.id, two);
    expect(await trackJobs()).toHaveLength(1);
    // The frame reads did not locate objects one picture at a time.
    expect(await db.select().from(observations).where(eq(observations.type, "object_mask"))).toHaveLength(0);
  });

  test("a half-sampled clip waits for the rest", async () => {
    const { project, up } = await clip("clip");
    await withTrace({ projectId: project.id, uploadId: up.id }, () => storeVideoFrame(up, 0, JPEG, 3));
    await run(project.id, (await analyzeJobs())[0]);
    expect(await trackJobs()).toHaveLength(0);
  });

  test("a lane that reads frames never queues tracking", async () => {
    const { project, up } = await clip("frames");
    await withTrace({ projectId: project.id, uploadId: up.id }, () => storeVideoFrame(up, 0, JPEG, 1));
    await run(project.id, (await analyzeJobs())[0]);
    expect(await trackJobs()).toHaveLength(0);
  });

  test("tracking writes one object_track per object SAM followed, with its id and frames, all traced", async () => {
    const { project, up } = await clip("clip");
    await db.insert(observations).values({ projectId: project.id, uploadId: up.id, type: "object_detected", eventTime: new Date(), confidence: 0.8, payload: { label: "Chair" } });
    fakeSam();
    const r = await withTrace({ projectId: project.id, uploadId: up.id }, () => HANDLERS.track_video({ id: "j", projectId: project.id, payload: { uploadId: up.id } }));
    expect(r).toEqual({ concepts: 1, tracks: 2, billedFrames: 60 });
    const tracks = await db.select().from(observations).where(eq(observations.type, "object_track"));
    expect(tracks.map((t) => (t.payload as Record<string, unknown>).sam_object_id).sort()).toEqual(["0", "7"]);
    expect(tracks.find((t) => (t.payload as Record<string, unknown>).sam_object_id === "0")?.payload).toMatchObject({ label: "chair", first_frame: 0, last_frame: 5, frames_seen: 3, gaps: 1, lane: "Gym floor" });
    expect(tracks[0].provenance).toMatchObject({ producer: "sam.video", estimate: true });
    const names = (await db.select().from(traces).where(eq(traces.uploadId, up.id))).map((t) => t.name).sort();
    expect(names).toEqual(["sam.read_tracks", "sam.segment_video", "video.write_tracks"]);
    // Running it again leaves the tracks alone and does not spend again.
    fakeSam();
    expect(await trackVideo(project.id, { uploadId: up.id })).toEqual({ skipped: "already tracked", tracks: 2 });
    expect(asked).toHaveLength(0);
  });

  test("it waits for frames still being read, and skips a removed video, no findings, or a missing file", async () => {
    const { project, up } = await clip("clip");
    expect(await trackVideo(project.id, { uploadId: crypto.randomUUID() })).toEqual({ skipped: "the video was removed" });
    await db.insert(jobs).values({ projectId: project.id, kind: "analyze_video_frame", payload: { uploadId: up.id, key: "k", atMs: 0 }, status: "queued" });
    await expect(trackVideo(project.id, { uploadId: up.id })).rejects.toThrow("still being read");
    await db.delete(jobs);
    expect(await trackVideo(project.id, { uploadId: up.id })).toEqual({ skipped: "nothing to follow", tracks: 0 });
    await db.insert(observations).values({ projectId: project.id, uploadId: up.id, type: "object_detected", eventTime: new Date(), payload: { label: "chair" } });
    await db.update(uploads).set({ key: "u/missing.mp4" }).where(eq(uploads.id, up.id));
    await expect(trackVideo(project.id, { uploadId: up.id })).rejects.toThrow("original video is gone");
  });
});
