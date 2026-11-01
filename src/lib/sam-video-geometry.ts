import { decodeMaskToRaster, frameIndexOf, parseVideoStream, recordsOfKind } from "@meta-sam/parser";

/** One object in one frame of a clip, in the pixels of that frame. */
export type SamSighting = {
  /** The frame's own number in the clip, read from its `<Nf>` marker, never the line's position. */
  frame: number;
  box: [number, number, number, number];
  confidence: number | null;
  areaPx: number;
};

/** One object followed through a clip. SAM keeps its id while it stays in view; the id is local to one response. */
export type SamTrack = { objectId: string; sightings: SamSighting[] };

export type SamVideoResult = { width: number; height: number; tracks: SamTrack[]; warnings: string[] };

const SIZE = /<\|box;[^|]*w=(\d+);h=(\d+)/;

/**
 * Read SAM 3.1's output text for a clip. Lines come one per frame, forward frames then backward ones, and
 * frames with nothing in them have no line, so every sighting carries the frame number SAM gave it. Ids
 * are sparse and kept as given. Empty text is a clip with nothing found, which is an answer, not an error.
 */
export async function readSamVideo(text: string): Promise<SamVideoResult> {
  if (!text.trim()) return { width: 0, height: 0, tracks: [], warnings: [] };
  async function* events() {
    yield { type: "response.output_text.done", item_id: "sam", output_index: 0, content_index: 0, text };
    yield { type: "response.completed" };
  }
  const res = await parseVideoStream(events()).finalResult;
  const boxes = new Map(recordsOfKind(res.records, "box").map((b) => [`${frameIndexOf(b)}:${b.objectId}`, b]));
  const byId = new Map<string, SamSighting[]>();
  for (const m of recordsOfKind(res.records, "mask")) {
    const frame = frameIndexOf(m);
    if (frame === undefined) continue;
    const b = m.bounds;
    const sx = (b.right - b.left) / m.mask.width;
    const sy = (b.bottom - b.top) / m.mask.height;
    const on = decodeMaskToRaster(m.mask).reduce((a, v) => a + v, 0);
    const list = byId.get(m.objectId) ?? [];
    list.push({ frame, box: [b.left, b.top, b.right, b.bottom], confidence: m.confidence ?? boxes.get(`${frame}:${m.objectId}`)?.confidence ?? null, areaPx: Math.round(on * sx * sy) });
    byId.set(m.objectId, list);
  }
  const tracks = [...byId].map(([objectId, sightings]) => ({ objectId, sightings: sightings.sort((a, b) => a.frame - b.frame) }));
  const [, w, h] = SIZE.exec(text) ?? [];
  return { width: Number(w ?? 0), height: Number(h ?? 0), tracks, warnings: res.diagnostics.map((d) => `${d.code}: ${d.message}`) };
}

/** What one track says about an object, in frames. `gaps` counts the places the object vanished and came back under the same id. */
export function trackSummary(t: SamTrack) {
  const frames = t.sightings.map((s) => s.frame);
  const gaps = frames.slice(1).filter((f, i) => f - frames[i] > 1).length;
  const scored = t.sightings.filter((s) => s.confidence !== null);
  return {
    objectId: t.objectId,
    first: frames[0] ?? 0,
    last: frames[frames.length - 1] ?? 0,
    seen: frames.length,
    gaps,
    confidence: scored.length ? Math.round((scored.reduce((a, s) => a + (s.confidence ?? 0), 0) / scored.length) * 1000) / 1000 : null,
  };
}

/** Frames Meta bills for a clip: every frame processed, but never fewer than 50. */
export const billedFrames = (processed: number) => Math.max(50, processed);
