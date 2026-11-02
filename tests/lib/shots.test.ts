import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/db";
import { jobs, observations, projectProducts, traces, uploads } from "@/db/schema";
import { HANDLERS } from "@/lib/job-handlers";
import { recordObservation } from "@/lib/observations";
import { withTrace } from "@/lib/trace";
import { detectShots, queueShots, SHOT_PRODUCT, signatureOf } from "@/sources/shots";
import { reset, seedProject } from "../db";
import { modelCalls, putFile, scriptModel } from "../fakes";

beforeEach(reset);

const solid = (v: number) => sharp({ create: { width: 64, height: 36, channels: 3, background: { r: v, g: v, b: v } } }).jpeg().toBuffer();

/** A video whose frames are stored: each entry is a grey level, two seconds apart. */
async function video(levels: number[], opts: { on?: boolean; planned?: number; skipFile?: number[] } = {}) {
  const { user, project } = await seedProject();
  if (opts.on !== false) await db.insert(projectProducts).values({ projectId: project.id, productId: SHOT_PRODUCT });
  const [up] = await db.insert(uploads).values({ projectId: project.id, userId: user.id, key: `u/${crypto.randomUUID()}/a.mp4`, filename: "a.mp4", contentType: "video/mp4", size: 1, status: "ready", createdAt: new Date("2026-10-20T09:00:00Z") }).returning();
  for (const [i, v] of levels.entries()) {
    const key = `f/${up.id}/${i}.jpg`;
    if (!opts.skipFile?.includes(i)) putFile(key, new Uint8Array(await solid(v)));
    await recordObservation({ projectId: project.id, uploadId: up.id, type: "video_frame", eventTime: new Date(up.createdAt.getTime() + i * 2000), payload: { at_ms: i * 2000, of: opts.planned ?? levels.length }, provenance: { frame: key } });
  }
  return { project, up };
}

const label = (footage: string) => ({ footage, description: `A ${footage} shot`, confidence: 0.8 });
const shots = (uploadId: string) => db.select().from(observations).where(eq(observations.uploadId, uploadId)).then((r) => r.filter((o) => o.type === "video_shot").sort((a, b) => (a.payload as { shot_no: number }).shot_no - (b.payload as { shot_no: number }).shot_no));

describe("signatureOf", () => {
  test("a frame becomes 16 by 9 pixels of three channels", async () => {
    expect(await signatureOf(new Uint8Array(await solid(100)))).toHaveLength(16 * 9 * 3);
  });
});

describe("queueShots", () => {
  test("queues once when the product is on and every frame is stored", async () => {
    const { up } = await video([30, 31, 200]);
    expect(await queueShots(up)).toBe(true);
    expect(await queueShots(up)).toBe(false);
    expect(await db.select().from(jobs).where(eq(jobs.kind, "detect_shots"))).toHaveLength(1);
  });

  test("waits for missing frames and stays quiet when the product is off", async () => {
    const half = await video([30, 31], { planned: 4 });
    expect(await queueShots(half.up)).toBe(false);
    const off = await video([30, 31], { on: false });
    expect(await queueShots(off.up)).toBe(false);
  });
});

describe("detectShots", () => {
  test("cuts a clip, labels each shot from its middle frame and writes video_shot rows", async () => {
    const { project, up } = await video([30, 32, 31, 220, 222, 221]);
    scriptModel(label("reporter"), label("aerial"));
    const out = await withTrace({ projectId: project.id, uploadId: up.id }, () => detectShots(project.id, { uploadId: up.id }));
    expect(out).toMatchObject({ frames: 6, cuts: 1, shots: 2 });
    const rows = await shots(up.id);
    expect(rows).toHaveLength(2);
    expect(rows[0].payload).toMatchObject({ shot_no: 1, start_ms: 0, end_ms: 6000, footage: "reporter", at: "00:00", file: "a.mp4" });
    expect(rows[1].payload).toMatchObject({ shot_no: 2, start_ms: 6000, start_after_ms: 4000, footage: "aerial" });
    expect(rows[1].provenance).toMatchObject({ cuts: "code", estimate: true, at_ms: 6000 });
    expect(modelCalls).toHaveLength(2);
    const names = (await db.select().from(traces)).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["video.compare_frames", "video.find_cuts", "perception.footage", "observations.write"]));
  });

  test("is safe to run again", async () => {
    const { project, up } = await video([30, 31, 220, 221]);
    scriptModel(label("podium"), label("other"));
    await detectShots(project.id, { uploadId: up.id });
    expect(await detectShots(project.id, { uploadId: up.id })).toMatchObject({ skipped: "already cut into shots", shots: 2 });
    expect(await shots(up.id)).toHaveLength(2);
  });

  test("fails loudly when the stored frames are gone", async () => {
    const { project, up } = await video([30, 31, 220, 221], { skipFile: [1, 2, 3] });
    await expect(detectShots(project.id, { uploadId: up.id })).rejects.toThrow("stored frames are gone");
  });

  test("one missing frame is skipped and the rest still cut", async () => {
    const { project, up } = await video([30, 31, 220, 221, 222], { skipFile: [3] });
    scriptModel(label("reporter"), label("aerial"));
    expect(await detectShots(project.id, { uploadId: up.id })).toMatchObject({ frames: 4, cuts: 1, shots: 2 });
  });

  test("skips a removed video and a clip with fewer than two frames", async () => {
    const { project } = await seedProject();
    expect(await detectShots(project.id, { uploadId: crypto.randomUUID() })).toMatchObject({ skipped: "the video was removed" });
    const one = await video([30]);
    expect(await detectShots(one.project.id, { uploadId: one.up.id })).toMatchObject({ skipped: "needs at least two stored frames" });
  });

  test("the job handler runs it for the upload", async () => {
    const { project, up } = await video([30, 31, 220, 221]);
    scriptModel(label("reporter"), label("aerial"));
    await HANDLERS.detect_shots({ projectId: project.id, payload: { uploadId: up.id } } as never);
    expect(await shots(up.id)).toHaveLength(2);
  });
});
