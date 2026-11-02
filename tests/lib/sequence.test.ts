import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/db";
import { jobs, observations, projectProducts, traces, uploads } from "@/db/schema";
import { HANDLERS } from "@/lib/job-handlers";
import { recordObservation } from "@/lib/observations";
import { withTrace } from "@/lib/trace";
import { INCIDENT_PRODUCT, queueSequence, readSequence, RESPONSE_PRODUCT, TEXT_PRODUCT } from "@/sources/sequence";
import { reset, seedProject } from "../db";
import { modelCalls, putFile, scriptModel } from "../fakes";

beforeEach(reset);

const jpeg = (v: number) => sharp({ create: { width: 32, height: 18, channels: 3, background: { r: v, g: v, b: v } } }).jpeg().toBuffer();

async function video(frames: number, products: string[], opts: { skipFile?: number[]; planned?: number } = {}) {
  const { user, project } = await seedProject();
  for (const productId of products) await db.insert(projectProducts).values({ projectId: project.id, productId });
  const [up] = await db.insert(uploads).values({ projectId: project.id, userId: user.id, key: `u/${crypto.randomUUID()}/c.mp4`, filename: "c.mp4", contentType: "video/mp4", size: 1, status: "ready", createdAt: new Date("2026-10-20T09:00:00Z") }).returning();
  for (let i = 0; i < frames; i++) {
    const key = `f/${up.id}/${i}.jpg`;
    if (!opts.skipFile?.includes(i)) putFile(key, new Uint8Array(await jpeg(40 + i)));
    await recordObservation({ projectId: project.id, uploadId: up.id, type: "video_frame", eventTime: new Date(up.createdAt.getTime() + i * 2000), payload: { at_ms: i * 2000, of: opts.planned ?? frames }, provenance: { frame: key } });
  }
  return { project, up };
}

const read = (text: string[], vehicles = 0, people = 0) => ({ text: text.map((t) => ({ text: t, where: "caption" })), responders: { vehicles, people }, confidence: 0.7 });
const of = (uploadId: string, type: string) => db.select().from(observations).where(eq(observations.uploadId, uploadId)).then((r) => r.filter((o) => o.type === type).sort((a, b) => (a.payload as { at_ms: number }).at_ms - (b.payload as { at_ms: number }).at_ms));

describe("queueSequence", () => {
  test("queues once, only when a product is on and the frames are all stored", async () => {
    const { up } = await video(3, [TEXT_PRODUCT]);
    expect(await queueSequence(up)).toBe(true);
    expect(await queueSequence(up)).toBe(false);
    expect(await db.select().from(jobs).where(eq(jobs.kind, "read_sequence"))).toHaveLength(1);
    expect((await video(3, [])).up).toBeDefined();
    expect(await queueSequence((await video(3, [])).up)).toBe(false);
    expect(await queueSequence((await video(2, [TEXT_PRODUCT], { planned: 5 })).up)).toBe(false);
  });
});

describe("readSequence", () => {
  test("reads words and responders per frame and writes one Observation each", async () => {
    const { project, up } = await video(3, [TEXT_PRODUCT, RESPONSE_PRODUCT]);
    scriptModel(read(["10/04 14:02"], 0, 0), read(["BREAKING", "  "], 2, 3), read([], 4, 6));
    const out = await withTrace({ projectId: project.id, uploadId: up.id }, () => readSequence(project.id, { uploadId: up.id }));
    expect(out).toMatchObject({ frames: 3, observations: 5, incidents: 0 });
    const text = await of(up.id, "video_text");
    expect(text.map((t) => (t.payload as { text: string }).text)).toEqual(["10/04 14:02", "BREAKING"]);
    const counts = await of(up.id, "responder_count");
    expect(counts.map((c) => (c.payload as { responders: number }).responders)).toEqual([0, 5, 10]);
    expect(counts[2].provenance).toMatchObject({ estimate: true });
    expect((await db.select().from(traces)).map((t) => t.name)).toContain("perception.frame_details");
  });

  test("only the products that are on write", async () => {
    const { project, up } = await video(2, [RESPONSE_PRODUCT]);
    scriptModel(read(["ignored"], 1), read([], 2));
    await readSequence(project.id, { uploadId: up.id });
    expect(await of(up.id, "video_text")).toHaveLength(0);
    expect(await of(up.id, "responder_count")).toHaveLength(2);
  });

  test("incidents: the model names frame numbers, code gives them times and drops guesses", async () => {
    const { project, up } = await video(5, [INCIDENT_PRODUCT]);
    scriptModel({ incidents: [
      { frame: 3, kind: "impact", description: "Two vehicles collide", confidence: 0.9 },
      { frame: 4, kind: "impact", description: "Same crash again", confidence: 0.8 },
      { frame: 99, kind: "fire", description: "Not a real frame", confidence: 0.9 },
    ] });
    const out = await withTrace({ projectId: project.id, uploadId: up.id }, () => readSequence(project.id, { uploadId: up.id }));
    expect(out).toMatchObject({ incidents: 1 });
    const [i] = await of(up.id, "video_incident");
    expect(i.payload).toMatchObject({ kind: "impact", at_ms: 4000, at: "00:04", frame_no: 3 });
    expect(i.provenance).toMatchObject({ verified: "frame number exists", estimate: true });
    expect(modelCalls).toHaveLength(1);
    const names = (await db.select().from(traces)).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["perception.incidents", "video.verify_incidents", "observations.write"]));
  });

  test("more frames than the model can see are spread evenly", async () => {
    const { project, up } = await video(40, [INCIDENT_PRODUCT]);
    scriptModel({ incidents: [{ frame: 16, kind: "smoke", description: "Smoke at the end", confidence: 0.6 }] });
    await readSequence(project.id, { uploadId: up.id });
    const [i] = await of(up.id, "video_incident");
    expect(i.payload).toMatchObject({ at_ms: 78_000 });
  });

  test("is safe to run again, and skips a removed video or one with no frames", async () => {
    const { project, up } = await video(2, [RESPONSE_PRODUCT]);
    scriptModel(read([], 1), read([], 1));
    await readSequence(project.id, { uploadId: up.id });
    expect(await readSequence(project.id, { uploadId: up.id })).toMatchObject({ skipped: "already read" });
    expect(await readSequence(project.id, { uploadId: crypto.randomUUID() })).toMatchObject({ skipped: "the video was removed" });
    const empty = await video(0, [RESPONSE_PRODUCT]);
    expect(await readSequence(empty.project.id, { uploadId: empty.up.id })).toMatchObject({ skipped: "no stored frames" });
  });

  test("frames missing from storage are skipped, and no frames means no model call", async () => {
    const { project, up } = await video(3, [RESPONSE_PRODUCT, INCIDENT_PRODUCT], { skipFile: [0, 1, 2] });
    expect(await readSequence(project.id, { uploadId: up.id })).toMatchObject({ observations: 0, incidents: 0 });
    expect(modelCalls).toHaveLength(0);
  });

  test("the job handler runs it", async () => {
    const { project, up } = await video(1, [RESPONSE_PRODUCT]);
    scriptModel(read([], 1, 1));
    await HANDLERS.read_sequence({ projectId: project.id, payload: { uploadId: up.id } } as never);
    expect(await of(up.id, "responder_count")).toHaveLength(1);
  });
});
