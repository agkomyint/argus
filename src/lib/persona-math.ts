/**
 * Deterministic maths for the persona panel. The persona models only point at places on a screenshot;
 * everything measured from those points (heat, agreement, who would carry on) is worked out here.
 * DB-free, so the fusion step and the widgets share one definition.
 */

export type PersonaPoint = { x: number; y: number; weight?: number };

/** Heat is binned on a GRID × GRID map of the screenshot, positions in 0..1. */
export const GRID = 8;

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

/** Spread each point over its neighbouring cells (a small gaussian), then scale to a total of 1. */
export function heatOf(points: PersonaPoint[]): number[] {
  const cells = new Array<number>(GRID * GRID).fill(0);
  const sigma = 0.9;
  for (const p of points) {
    const cx = clamp01(p.x) * GRID - 0.5;
    const cy = clamp01(p.y) * GRID - 0.5;
    const w = p.weight ?? 1;
    for (let gy = 0; gy < GRID; gy++)
      for (let gx = 0; gx < GRID; gx++) cells[gy * GRID + gx] += w * Math.exp(-((gx - cx) ** 2 + (gy - cy) ** 2) / (2 * sigma * sigma));
  }
  const sum = cells.reduce((a, b) => a + b, 0);
  return sum ? cells.map((c) => c / sum) : cells;
}

/** How alike two heat maps are, 0 (looked at different things) to 1 (looked at the same things). */
export function similarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export type PersonaPair = { a: string; b: string; score: number };

/**
 * Agreement for one screen: the mean similarity over every pair of personas, as 0..100, plus the pair
 * that looked at the most different places. Fewer than two personas means there is nothing to compare.
 */
export function agreementOf(views: { persona: string; points: PersonaPoint[] }[]): { agreement: number | null; pairs: PersonaPair[]; split: PersonaPair | null } {
  const maps = views.filter((v) => v.points.length).map((v) => ({ persona: v.persona, heat: heatOf(v.points) }));
  const pairs: PersonaPair[] = [];
  for (let i = 0; i < maps.length; i++)
    for (let j = i + 1; j < maps.length; j++) pairs.push({ a: maps[i].persona, b: maps[j].persona, score: Math.round(similarity(maps[i].heat, maps[j].heat) * 100) });
  if (!pairs.length) return { agreement: null, pairs, split: null };
  const agreement = Math.round(pairs.reduce((s, p) => s + p.score, 0) / pairs.length);
  const split = pairs.reduce((lo, p) => (p.score < lo.score ? p : lo));
  return { agreement, pairs, split };
}

export { clamp01 };
