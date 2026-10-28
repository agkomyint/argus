import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs, observations, projectProducts, traces, uploads } from "@/db/schema";
import { processUpload } from "@/lib/connectors";
import { placeOf } from "@/lib/explore";
import { HANDLERS } from "@/lib/job-handlers";
import { familyOf, MODELS, modelFor } from "@/lib/models";
import { conceptsOf, locate, MAX_CONCEPTS, placements, segment, wantsMasks } from "@/lib/sam";
import { placePath, readSam, simplifyPath } from "@/lib/sam-geometry";
import { withTrace } from "@/lib/trace";
import { storeVideoFrame } from "@/sources/video";
import { reset, seedProject } from "../db";
import { putFile, scheduled, scriptModel } from "../fakes";

// A real SAM 3.1 answer for "sign" on a 1024 × 767 site photo: two signs, each a box and a mask.
const SIGN = await Bun.file(`${import.meta.dir}/../fixtures/sam-sign.txt`).text();

type Call = { url: string; body: Record<string, unknown>; headers: Record<string, string>; signal?: AbortSignal | null };
const calls: Call[] = [];
const realFetch = globalThis.fetch;

/** Answer each SAM call with the next of `replies`: a text, or a bare status. */
function fakeSam(...replies: (string | number | { status: number; retryAfter?: string })[]) {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string>, signal: init.signal });
    const r = replies.shift() ?? "";
    if (typeof r === "string") return Response.json({ output: [{ content: [{ text: r }] }], usage: { images_processed: 1 } });
    const { status, retryAfter } = typeof r === "number" ? { status: r, retryAfter: undefined } : r;
    return new Response("{}", { status, headers: retryAfter ? { "retry-after": retryAfter } : {} });
  }) as unknown as typeof fetch;
}

beforeEach(async () => {
  await reset();
  calls.length = 0;
  process.env.META_API_KEY = "test-key";
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.META_API_KEY;
  delete process.env.META_SAM_MODEL;
});

describe("model registry", () => {
  test("each capability has one model, env overrides win", () => {
    expect(new Set(MODELS.map((m) => m.capability)).size).toBe(MODELS.length);
    expect(modelFor("segment")).toBe("sam-3.1");
    process.env.META_SAM_MODEL = "sam-3.2";
    expect(modelFor("segment")).toBe("sam-3.2");
    expect(modelFor("reason")).toBe("test-model");
  });

  test("families for labels", () => {
    expect(familyOf("sam-3.1")).toBe("SAM");
    expect(familyOf("muse-spark-1.2")).toBe("Muse Spark");
    expect(familyOf("other-model")).toBe("other-model");
    expect(familyOf(null)).toBeNull();
  });
});

describe("reading SAM's answer", () => {
  test("the real answer: two signs with boxes, scores, areas and short outlines", async () => {
    const r = await readSam(SIGN);
    expect([r.width, r.height]).toEqual([1024, 767]);
    expect(r.warnings).toEqual([]);
    expect(r.instances.map((i) => i.objectId)).toEqual(["0", "1"]);
    const [a, b] = r.instances;
    expect(a.box).toEqual([590, 320, 643, 493]);
    expect(a.confidence).toBeCloseTo(0.636, 3);
    expect(b.confidence).toBeCloseTo(0.883, 3);
    // The mask covers most of its box, never more.
    expect(a.areaPx).toBeGreaterThan(7000);
    expect(a.areaPx).toBeLessThanOrEqual(53 * 173);
    for (const i of r.instances) {
      expect(i.outline!.length).toBeLessThan(1200);
      expect(i.outline).toMatch(/^M[\d. ]+(L[\d. ]+)+Z/);
      // Every point of the outline sits inside the box, give or take the half-pixel edge.
      const pts = [...i.outline!.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
      for (const [x, y] of pts) {
        expect(x).toBeGreaterThanOrEqual(i.box[0] - 1);
        expect(x).toBeLessThanOrEqual(i.box[2] + 1);
        expect(y).toBeGreaterThanOrEqual(i.box[1] - 1);
        expect(y).toBeLessThanOrEqual(i.box[3] + 1);
      }
    }
  });

  test("an empty answer means nothing was found", async () => {
    expect(await readSam("  ")).toEqual({ width: 0, height: 0, instances: [], warnings: [] });
  });

  test("a broken object is dropped and said, the rest kept", async () => {
    const bad = SIGN.slice(0, SIGN.lastIndexOf("<|mask;")) + "<|mask;x=0;y=0;c=0.8;data=zz|>";
    const r = await readSam(bad);
    expect(r.instances.map((i) => i.objectId)).toEqual(["0"]);
    expect(r.warnings).toEqual(["malformed_record: Malformed SAM API object record."]);
  });

  test("simplifying keeps corners and drops the steps between them", () => {
    expect(simplifyPath("M0 0L1 0L2 0L3 0L3 1L3 2L3 3L0 3Z")).toEqual([[[0, 0], [3, 0], [3, 3], [0, 3]]]);
    // Two rings, and a sliver too thin to be a shape is dropped.
    expect(simplifyPath("M0 0L2 0L2 2L0 2ZM5 5L6 5Z")).toHaveLength(1);
    expect(simplifyPath("m0 0l4 0l4 4z")).toHaveLength(1);
    expect(placePath([[[0, 0], [10, 0], [10, 5]]], 100, 50, 0.5, 2)).toBe("M100 50L105 50L105 60Z");
    expect(placePath([], 0, 0, 1, 1)).toBeNull();
  });
});

describe("placing and choosing", () => {
  test("placements are shares of the frame", async () => {
    const [a] = placements("sign", await readSam(SIGN));
    expect(a).toMatchObject({ label: "sign", frame: [1024, 767], box: [590, 320, 643, 493], sam_object_id: "0" });
    expect(a.x).toBeCloseTo((590 + 643) / 2 / 1024, 3);
    expect(a.y).toBeCloseTo((320 + 493) / 2 / 767, 3);
    expect(a.area_pct).toBeGreaterThan(0.9);
    expect(a.area_pct).toBeLessThan(1.2);
    expect(placements("x", { width: 0, height: 0, instances: [], warnings: [] })).toEqual([]);
  });

  test("concepts: distinct, most confident first, capped, never none", () => {
    const f = (label: string, confidence: number) => ({ label, confidence });
    expect(conceptsOf([f("Truck", 0.5), f("truck", 0.9), f("none", 1), f(" ", 1), f("crane", 0.7)])).toEqual(["truck", "crane"]);
    expect(conceptsOf(Array.from({ length: 9 }, (_, i) => f(`k${i}`, i / 10)))).toHaveLength(MAX_CONCEPTS);
  });

  test("masks are wanted only when a product reads them", () => {
    expect(wantsMasks(["object-footprint"])).toBe(true);
    expect(wantsMasks(["density-heatmap"])).toBe(true);
    expect(wantsMasks(["object-detection-dataset", "people-count", "unknown"])).toBe(false);
  });

  test("a replay only takes a well-shaped place, and only a plain outline", () => {
    expect(placeOf({ frame: [10, 10], box: [1, 1, 5, 5], outline: "M1 1L5 1L5 5Z" })).toEqual({ place: { frame: [10, 10], box: [1, 1, 5, 5], outline: "M1 1L5 1L5 5Z" } });
    expect(placeOf({ frame: [10, 10], box: [1, 1, 5, 5], outline: "M1 1<script>" }).place?.outline).toBeNull();
    expect(placeOf({ frame: [0, 10], box: [1, 1, 5, 5] })).toEqual({});
    expect(placeOf({ frame: [10, 10], box: [1, 1, "5", 5] })).toEqual({});
    expect(placeOf({})).toEqual({});
  });
});

describe("calling SAM", () => {
  test("one concept per call, a data URL, and both steps traced", async () => {
    const { project } = await seedProject();
    fakeSam(SIGN);
    const { default: sharp } = await import("sharp");
    const big = new Uint8Array(await sharp({ create: { width: 2048, height: 1534, channels: 3, background: "#456" } }).jpeg().toBuffer());
    const r = await withTrace({ projectId: project.id }, () => segment(big, "sign"));
    expect(r.instances).toHaveLength(2);
    expect(calls[0].url).toBe("https://api.meta.ai/v1/responses");
    expect(calls[0].headers).toMatchObject({ Authorization: "Bearer test-key", "User-Agent": "argus-demo/0.1" });
    expect(calls[0].signal).toBeInstanceOf(AbortSignal);
    const content = (calls[0].body.input as { content: { type: string; text?: string; image_url?: string }[] }[])[0].content;
    expect(content[0]).toEqual({ type: "input_text", text: "sign" });
    expect(content[1].image_url).toStartWith("data:image/jpeg;base64,");
    // Shrunk to 1024 wide before it is sent.
    const sent = await sharp(Buffer.from(content[1].image_url!.split(",")[1], "base64")).metadata();
    expect(sent.width).toBe(1024);

    const steps = await db.select().from(traces).where(eq(traces.projectId, project.id));
    const model = steps.find((s) => s.name === "sam.segment")!;
    expect(model).toMatchObject({ kind: "model", model: "sam-3.1", status: "ok", output: { found: 2, images_processed: 1 } });
    expect(model.input).toMatchObject({ concept: "sign", image: { bytes: expect.any(Number) } });
    expect(steps.find((s) => s.name === "sam.read_masks")).toMatchObject({ kind: "code", output: { size: [1024, 767], objects: 2 } });
  });

  test("busy once: waits and tries again", async () => {
    fakeSam({ status: 429, retryAfter: "0.01" }, "");
    expect((await segment(new Uint8Array([1, 2]), "truck")).instances).toEqual([]);
    expect(calls).toHaveLength(2);
  });

  test("a failed call throws and is recorded as failed", async () => {
    const { project } = await seedProject();
    fakeSam(500);
    expect(withTrace({ projectId: project.id }, () => segment(new Uint8Array([1]), "truck"))).rejects.toThrow("SAM answered 500");
    fakeSam(429, 429);
    expect(segment(new Uint8Array([1]), "truck")).rejects.toThrow("SAM answered 429 (busy)");
  });
});

describe("Spark names, SAM locates", () => {
  test("locate writes one object_mask row per instance, and skips a concept whose call failed", async () => {
    const { project } = await seedProject();
    fakeSam(SIGN, 500);
    const ids = await withTrace({ projectId: project.id }, () =>
      locate(new Uint8Array([1]), [{ label: "sign", confidence: 0.9 }, { label: "truck", confidence: 0.5 }], { projectId: project.id, eventTime: new Date("2026-10-28T10:00:00Z"), provenance: { connector: "image-upload" } }, { file: "a.jpg" }),
    );
    expect(ids).toHaveLength(2);
    const rows = await db.select().from(observations).where(eq(observations.projectId, project.id));
    expect(rows.every((r) => r.type === "object_mask")).toBe(true);
    expect(rows[0].payload).toMatchObject({ label: "sign", object_class: "sign", file: "a.jpg", frame: [1024, 767] });
    expect(rows[0].provenance).toEqual({ connector: "image-upload", producer: "sam-3.1", estimate: true });
    expect(rows.map((r) => r.confidence).sort()).toEqual([expect.closeTo(0.636, 3), expect.closeTo(0.883, 3)]);
    const steps = (await db.select().from(traces).where(eq(traces.projectId, project.id))).map((t) => `${t.name}:${t.status}`).sort();
    expect(steps).toEqual(["observations.write:ok", "sam.read_masks:ok", "sam.segment:error", "sam.segment:ok"]);
  });

  test("nothing found, or no key: no rows and no calls", async () => {
    const { project } = await seedProject();
    fakeSam("");
    const base = { projectId: project.id, eventTime: new Date() };
    expect(await locate(new Uint8Array([1]), [{ label: "truck", confidence: 1 }], base, {})).toEqual([]);
    delete process.env.META_API_KEY;
    expect(await locate(new Uint8Array([1]), [{ label: "truck", confidence: 1 }], base, {})).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  test("a photo on a project with Object footprint gets its masks", async () => {
    const { user, project } = await seedProject();
    await db.insert(projectProducts).values({ projectId: project.id, productId: "object-footprint" });
    const key = `u/${crypto.randomUUID()}/site.jpg`;
    putFile(key, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    const [up] = await db.insert(uploads).values({ projectId: project.id, userId: user.id, key, filename: "site.jpg", contentType: "image/jpeg", size: 4, status: "ready" }).returning();
    scriptModel({ findings: [{ label: "sign", kind: "object", confidence: 0.8, description: "A sign on the fence" }] });
    fakeSam(SIGN);
    expect(await processUpload(up.id)).toEqual({ detections: 1, frames: 1, masks: 2 });
    const masks = await db.select().from(observations).where(eq(observations.type, "object_mask"));
    expect(masks[0]).toMatchObject({ uploadId: up.id, payload: { upload_id: up.id, file: "site.jpg" } });
  });

  test("a photo without such a product makes no SAM call", async () => {
    const { user, project } = await seedProject();
    await db.insert(projectProducts).values({ projectId: project.id, productId: "object-detection-dataset" });
    const key = `u/${crypto.randomUUID()}/site.jpg`;
    putFile(key, new Uint8Array([1]));
    const [up] = await db.insert(uploads).values({ projectId: project.id, userId: user.id, key, filename: "site.jpg", contentType: "image/jpeg", size: 1, status: "ready" }).returning();
    scriptModel({ findings: [{ label: "sign", kind: "object", confidence: 0.8, description: "A sign" }] });
    fakeSam(SIGN);
    expect(await processUpload(up.id)).toEqual({ detections: 1, frames: 1 });
    expect(calls).toHaveLength(0);
  });

  test("video frames keep their second and their frame key on each mask", async () => {
    const { user, project } = await seedProject();
    await db.insert(projectProducts).values({ projectId: project.id, productId: "density-heatmap" });
    const key = `u/${crypto.randomUUID()}/walk.mp4`;
    putFile(key, "video");
    const [up] = await db.insert(uploads).values({ projectId: project.id, userId: user.id, key, filename: "walk.mp4", contentType: "video/mp4", size: 5, status: "ready", createdAt: new Date("2026-10-20T09:00:00Z") }).returning();
    const stored = await storeVideoFrame(up, 6000, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    scriptModel({ findings: [{ label: "sign", kind: "object", confidence: 0.6, description: "A sign" }] });
    fakeSam(SIGN);
    const [job] = await db.select().from(jobs);
    expect(await HANDLERS.analyze_video_frame({ ...job, projectId: project.id } as never)).toEqual({ at: "00:06", people: null, findings: 1, observations: 3 });
    const [mask] = await db.select().from(observations).where(eq(observations.type, "object_mask"));
    expect(mask.payload).toMatchObject({ at: "00:06", at_ms: 6000, upload_id: up.id });
    expect(mask.provenance).toMatchObject({ connector: "video-upload", producer: "sam-3.1", frame: stored!.key });
    expect(mask.eventTime.toISOString()).toBe("2026-10-20T09:00:06.000Z");
  });
});

describe("turning a product on later", () => {
  const named = (projectId: string, uploadId: string, label: string, extra: { frame?: string; payload?: Record<string, unknown> } = {}) =>
    db.insert(observations).values({
      projectId, uploadId, type: "object_detected", eventTime: new Date("2026-10-20T09:00:06Z"), confidence: 0.7,
      payload: { label, object_class: label.toLowerCase(), file: "f", upload_id: uploadId, lane: "Site", ...extra.payload },
      provenance: { connector: extra.frame ? "video-upload" : "image-upload", producer: "test-model", ...(extra.frame ? { frame: extra.frame, at_ms: 6000 } : {}) },
    });

  test("queues every picture Spark read but SAM has not, photos and frames, once each", async () => {
    const { user, project } = await seedProject();
    const ups = await db.insert(uploads).values(["a.jpg", "b.jpg", "walk.mp4"].map((filename) => ({ projectId: project.id, userId: user.id, key: `u/${filename}`, filename, contentType: "x", size: 1, status: "ready" as const }))).returning();
    await named(project.id, ups[0].id, "Sign");
    await named(project.id, ups[0].id, "Truck");
    await named(project.id, ups[1].id, "Sign");
    await db.insert(observations).values({ projectId: project.id, uploadId: ups[1].id, type: "object_mask", eventTime: new Date(), payload: {}, provenance: {} });
    await named(project.id, ups[2].id, "Crane", { frame: "f/6000.jpg" });
    await named(project.id, ups[2].id, "Crane", { frame: "f/7000.jpg" });

    const { setProducts } = await import("@/lib/ops");
    scheduled.length = 0;
    await setProducts(user.id, project.id, { add: ["object-footprint"] });
    // One drain for all of them, not one per job.
    expect(scheduled).toHaveLength(1);
    const queued = (await db.select().from(jobs).where(eq(jobs.kind, "locate_objects"))).map((j) => j.payload).sort((a, b) => String(a.frame).localeCompare(String(b.frame)));
    expect(queued).toEqual([{ uploadId: ups[2].id, frame: "f/6000.jpg" }, { uploadId: ups[2].id, frame: "f/7000.jpg" }, { uploadId: ups[0].id }]);
    const [step] = await db.select().from(traces).where(eq(traces.name, "sam.queue_past"));
    expect(step).toMatchObject({ projectId: project.id, output: { queued: 3 } });

    // On again before the jobs ran: nothing queued twice, and no drain for nothing.
    scheduled.length = 0;
    await setProducts(user.id, project.id, { add: ["density-heatmap"] });
    expect(await db.select().from(jobs).where(eq(jobs.kind, "locate_objects"))).toHaveLength(3);
    expect(scheduled).toHaveLength(0);

    // A product that reads no positions queues nothing.
    await db.delete(jobs);
    await setProducts(user.id, project.id, { add: ["object-detection-dataset"] });
    expect(await db.select().from(jobs)).toHaveLength(0);
  });

  test("a past frame is located with Spark's labels and keeps its second, its lane and its frame", async () => {
    const { user, project } = await seedProject();
    const [up] = await db.insert(uploads).values({ projectId: project.id, userId: user.id, key: "u/walk.mp4", filename: "walk.mp4", contentType: "video/mp4", size: 1, status: "ready" }).returning();
    await named(project.id, up.id, "Sign", { frame: "f/6000.jpg", payload: { at: "00:06", at_ms: 6000, description: "not copied" } });
    putFile("f/6000.jpg", new Uint8Array([1]));
    fakeSam(SIGN);
    const [job] = await db.insert(jobs).values({ projectId: project.id, kind: "locate_objects", payload: { uploadId: up.id, frame: "f/6000.jpg" } }).returning();
    expect(await HANDLERS.locate_objects(job)).toEqual({ masks: 2 });
    expect((calls[0].body.input as { content: { text?: string }[] }[])[0].content[0].text).toBe("sign");
    const [mask] = await db.select().from(observations).where(eq(observations.type, "object_mask"));
    expect(mask.payload).toMatchObject({ label: "sign", file: "f", lane: "Site", at: "00:06", at_ms: 6000, upload_id: up.id });
    expect(mask.payload).not.toHaveProperty("description");
    expect(mask.provenance).toEqual({ connector: "video-upload", frame: "f/6000.jpg", at_ms: 6000, located_later: true, producer: "sam-3.1", estimate: true });
    expect(mask.eventTime.toISOString()).toBe("2026-10-20T09:00:06.000Z");
    const steps = (await db.select().from(traces).where(eq(traces.uploadId, up.id))).map((t) => t.name).sort();
    expect(steps).toEqual(["observations.write", "sam.read_masks", "sam.segment"]);

    // Run again: already placed, no second call.
    expect(await HANDLERS.locate_objects(job)).toEqual({ skipped: "already located" });
    expect(calls).toHaveLength(1);
  });

  test("a past photo with nothing named, or whose file is gone, is skipped", async () => {
    const { user, project } = await seedProject();
    const [up] = await db.insert(uploads).values({ projectId: project.id, userId: user.id, key: "u/gone.jpg", filename: "gone.jpg", contentType: "image/jpeg", size: 1, status: "ready" }).returning();
    const { locateLater } = await import("@/lib/sam");
    expect(await locateLater(project.id, { uploadId: up.id })).toEqual({ skipped: "nothing named in this picture" });
    await named(project.id, up.id, "Sign");
    expect(await locateLater(project.id, { uploadId: up.id })).toEqual({ skipped: "the picture is gone" });
    expect(calls).toHaveLength(0);
  });
});
