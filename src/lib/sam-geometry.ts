import { decodeMaskToRaster, decodeMaskToSVGPath, parseImageStream, recordsOfKind } from "@meta-sam/parser";

/** One object SAM found for a concept, in the pixels of the picture it was sent. */
export type SamInstance = {
  /** SAM's own id for the object, local to one response. Kept as given, never an array position. */
  objectId: string;
  /** [left, top, right, bottom] in source pixels. */
  box: [number, number, number, number];
  /** The model's confidence, or null when it gave none. A missing score is not zero. */
  confidence: number | null;
  /** Pixels inside the mask, scaled to source pixels. */
  areaPx: number;
  /** The mask's outline as an SVG path in source pixels, or null when it simplified to nothing. */
  outline: string | null;
};

export type SamResult = { width: number; height: number; instances: SamInstance[]; warnings: string[] };

const FRAME = /<\|box;[^|]*w=(\d+);h=(\d+)/;

/**
 * Read SAM 3.1's output text for one picture. The text is special tokens, not JSON: the official parser
 * reads it, and code here turns each mask into an area and a short outline. Empty text is a run that
 * found nothing, which is an answer, not an error.
 */
export async function readSam(text: string): Promise<SamResult> {
  if (!text.trim()) return { width: 0, height: 0, instances: [], warnings: [] };
  async function* events() {
    yield { type: "response.output_text.done", item_id: "sam", output_index: 0, content_index: 0, text };
    yield { type: "response.completed" };
  }
  const res = await parseImageStream(events()).finalResult;
  const [, w, h] = FRAME.exec(text) ?? [];
  const boxes = new Map(recordsOfKind(res.records, "box").map((b) => [b.objectId, b]));
  const instances: SamInstance[] = [];
  for (const m of recordsOfKind(res.records, "mask")) {
    const b = m.bounds;
    const sx = (b.right - b.left) / m.mask.width;
    const sy = (b.bottom - b.top) / m.mask.height;
    const on = decodeMaskToRaster(m.mask).reduce((a, v) => a + v, 0);
    instances.push({
      objectId: m.objectId,
      box: [b.left, b.top, b.right, b.bottom],
      confidence: m.confidence ?? boxes.get(m.objectId)?.confidence ?? null,
      areaPx: Math.round(on * sx * sy),
      outline: placePath(simplifyPath(decodeMaskToSVGPath(m.mask)), b.left, b.top, sx, sy),
    });
  }
  // The parser drops an object whose box or mask is broken and says so in diagnostics, kept as warnings.
  return { width: Number(w ?? 0), height: Number(h ?? 0), instances, warnings: res.diagnostics.map((d) => `${d.code}: ${d.message}`) };
}

type Pt = [number, number];

/** Split a path of M/L/Z commands into closed rings of points. */
function rings(path: string): Pt[][] {
  const out: Pt[][] = [];
  let ring: Pt[] = [];
  for (const [, cmd, args] of path.matchAll(/([MLZmlz])([^MLZmlz]*)/g)) {
    const n = args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (cmd === "M" || cmd === "m") { if (ring.length) out.push(ring); ring = []; }
    if (cmd === "Z" || cmd === "z") { if (ring.length) out.push(ring); ring = []; continue; }
    for (let i = 0; i + 1 < n.length; i += 2) ring.push([n[i], n[i + 1]]);
  }
  if (ring.length) out.push(ring);
  return out;
}

const SIMPLIFY = 0.75;

/** Distance from p to the line through a and b. */
const off = (p: Pt, a: Pt, b: Pt) => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len = Math.hypot(dx, dy);
  return len === 0 ? Math.hypot(p[0] - a[0], p[1] - a[1]) : Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
};

/** Ramer–Douglas–Peucker: keep only the points that bend the line by more than `eps` pixels. */
function rdp(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  let [far, at] = [0, 0];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = off(pts[i], pts[0], pts[pts.length - 1]);
    if (d > far) [far, at] = [d, i];
  }
  if (far <= eps) return [pts[0], pts[pts.length - 1]];
  return [...rdp(pts.slice(0, at + 1), eps).slice(0, -1), ...rdp(pts.slice(at), eps)];
}

/**
 * The mask's outline traces every pixel step, which is kilobytes per object. Keeping only the corners that
 * matter makes it small enough to store with the row, and it still sits on the mask to within a pixel.
 */
export function simplifyPath(path: string, eps = SIMPLIFY): Pt[][] {
  return rings(path).map((r) => rdp([...r, r[0]], eps).slice(0, -1)).filter((r) => r.length >= 3);
}

/** Move rings from the mask's own raster into source pixels, as one SVG path. */
export function placePath(rs: Pt[][], left: number, top: number, sx: number, sy: number): string | null {
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const d = rs.map((r) => `M${r.map(([x, y]) => `${r1(left + x * sx)} ${r1(top + y * sy)}`).join("L")}Z`).join("");
  return d || null;
}
