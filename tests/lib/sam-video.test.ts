import { describe, expect, test } from "bun:test";
import { billedFrames, readSamVideo, trackSummary } from "@/lib/sam-video-geometry";

// A real SAM 3.1 answer for "sign" on one photo: object 0 and object 1, each a box and a mask. Reused
// here as the per-frame records of a clip, which has the same shape with a frame marker on each line.
const SIGN = await Bun.file(`${import.meta.dir}/../fixtures/sam-sign.txt`).text();
const [first, second] = SIGN.replace(/^<0f>/, "").split(/,(?=\d+<\|box)/);
const rec = (id: number, r: string) => r.replace(/^\d+/, String(id));

// Frame 4 comes before frame 1 (backward frames follow forward ones), frame 2 and 3 have no line, and
// object 7 is sparse: ids are not 0, 1, 2.
const CLIP = [`<0f>${rec(0, first)}`, `<1f>${rec(0, first)},${rec(7, second)}`, `<5f>${rec(0, first)}`, `<4f>${rec(7, second)}`].join("\n");

describe("SAM video output", () => {
  test("each object keeps its id, with the frame numbers SAM gave", async () => {
    const r = await readSamVideo(CLIP);
    expect(r.warnings).toEqual([]);
    expect(r.width).toBe(1024);
    expect(r.height).toBe(767);
    expect(r.tracks.map((t) => t.objectId).sort()).toEqual(["0", "7"]);
    const zero = r.tracks.find((t) => t.objectId === "0")!;
    expect(zero.sightings.map((s) => s.frame)).toEqual([0, 1, 5]);
    const seven = r.tracks.find((t) => t.objectId === "7")!;
    expect(seven.sightings.map((s) => s.frame)).toEqual([1, 4]);
    expect(zero.sightings[0].areaPx).toBeGreaterThan(0);
    expect(zero.sightings[0].confidence).toBeCloseTo(0.636, 2);
  });

  test("a summary counts frames seen and the places the object vanished and came back", async () => {
    const r = await readSamVideo(CLIP);
    const zero = trackSummary(r.tracks.find((t) => t.objectId === "0")!);
    expect(zero).toMatchObject({ objectId: "0", first: 0, last: 5, seen: 3, gaps: 1 });
    expect(zero.confidence).toBeCloseTo(0.636, 2);
    const none = trackSummary({ objectId: "9", sightings: [] });
    expect(none).toMatchObject({ first: 0, last: 0, seen: 0, gaps: 0, confidence: null });
    const unscored = trackSummary({ objectId: "9", sightings: [{ frame: 2, box: [0, 0, 1, 1], confidence: null, areaPx: 1 }] });
    expect(unscored.confidence).toBeNull();
  });

  test("empty text is a clip with nothing in it", async () => {
    expect(await readSamVideo("  ")).toEqual({ width: 0, height: 0, tracks: [], warnings: [] });
  });

  test("a clip is billed for at least 50 frames", () => {
    expect(billedFrames(12)).toBe(50);
    expect(billedFrames(300)).toBe(300);
  });
});

describe("segmentVideo", () => {
  const realFetch = globalThis.fetch;
  const urls: { url: string; body: unknown }[] = [];
  const fake = (files: Response, answer: Response) => {
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      urls.push({ url, body: typeof init.body === "string" ? JSON.parse(init.body) : init.body });
      return url.endsWith("/files") ? files : answer;
    }) as unknown as typeof fetch;
  };
  const withKey = async (f: () => Promise<void>) => {
    process.env.META_API_KEY = "test-key";
    urls.length = 0;
    try { await f(); } finally { globalThis.fetch = realFetch; }
  };

  test("uploads the clip once, asks with its file id, and bills at least 50 frames", () => withKey(async () => {
    const { segmentVideo } = await import("@/lib/sam");
    fake(Response.json({ id: "file-1" }), Response.json({ output: [{ content: [{ text: CLIP }] }], usage: { video_frames_processed: 12 } }));
    const r = await segmentVideo(new Uint8Array([1, 2, 3]), "sign");
    expect(r.tracks.length).toBe(2);
    expect(r.billedFrames).toBe(50);
    expect(urls[0].url.endsWith("/files")).toBe(true);
    const ask = urls[1].body as { model: string; input: { content: Record<string, unknown>[] }[]; metadata: Record<string, string> };
    expect(ask.input[0].content[1]).toEqual({ type: "input_video", file_id: "file-1" });
    expect(ask.metadata).toEqual({ include_confidence: "true", propagation_direction: "forward" });
  }));

  test("a clip that finds nothing, and failures, are plain answers", () => withKey(async () => {
    const { segmentVideo, MAX_VIDEO_BYTES } = await import("@/lib/sam");
    fake(Response.json({ id: "file-2" }), Response.json({ output: [{ content: [{ text: "" }] }] }));
    const none = await segmentVideo(new Uint8Array([1]), "sign");
    expect(none.tracks).toEqual([]);
    expect(none.billedFrames).toBe(50);
    fake(new Response("{}", { status: 500 }), Response.json({}));
    await expect(segmentVideo(new Uint8Array([1]), "sign")).rejects.toThrow("files answered 500");
    fake(Response.json({}), Response.json({}));
    await expect(segmentVideo(new Uint8Array([1]), "sign")).rejects.toThrow("no file id");
    fake(Response.json({ id: "f" }), new Response("{}", { status: 400 }));
    await expect(segmentVideo(new Uint8Array([1]), "sign")).rejects.toThrow("SAM answered 400");
    await expect(segmentVideo({ byteLength: MAX_VIDEO_BYTES + 1 } as Uint8Array, "sign")).rejects.toThrow("too large");
  }));
});
