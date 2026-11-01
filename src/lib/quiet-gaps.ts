/** A stretch in the middle of the timeline where nothing came in and nothing was being read. */
export type QuietGap = { from: number; to: number };

/**
 * The quiet stretches between busy ones. Each span is when something was really happening (a file landing, one
 * recorded step running, a live reading); `pad` is how long a mark counts as busy after it ends. `lead` is breathing
 * room kept before activity comes back, so the quiet ends a little before the first thing, not on top of it.
 * Only gaps with activity on both sides are returned: the quiet before the first and after the last span is already
 * the edge of the replay. `min` is the shortest gap worth marking, measured after the lead is taken off.
 */
export function quietGaps(spans: readonly (readonly [number, number])[], pad: number, min: number, lead = 0): QuietGap[] {
  const sorted = spans.map(([a, b]) => [a, Math.max(a, b) + pad] as const).sort((x, y) => x[0] - y[0]);
  const gaps: QuietGap[] = [];
  let reach = -Infinity;
  for (const [a, b] of sorted) {
    if (reach > -Infinity && a - lead - reach >= min) gaps.push({ from: reach, to: a - lead });
    reach = Math.max(reach, b);
  }
  return gaps;
}

/** How long a gap lasted, in words: "40 s", "12 min", "2 h 5 min". */
export function gapLength(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

/** A time axis that shows each quiet gap at a small fixed width, so the busy parts get the room. */
export type Axis = {
  /** Time to a place along the strip, 0 to 100 inside the window; below 0 or above 100 outside it. */
  x: (t: number) => number;
  /** A place along the strip, 0 to 100, back to a time. */
  at: (pct: number) => number;
};

/**
 * Two scales. Every active stretch is drawn at one scale (the same width per minute everywhere). Quiet gaps are drawn
 * on a squeezed scale of their own, so a longer gap is always wider than a shorter one but never by much: a width of
 * `unit` of the strip per log-minute, so 7 min is about 1.2% and 42 min about 2.2%, and a whole day about 3%. Only the
 * picture changes: times are still the real ones. With no gaps it is the plain straight axis.
 */
export function shrunkAxis(start: number, end: number, gaps: readonly QuietGap[], unit = 0.004): Axis {
  // Pieces in order: [real from, real to, shown length]; a gap's shown length is filled in once the active total is known.
  const pieces: [number, number, number][] = [];
  const quiet: number[] = [];
  let at = start;
  for (const g of gaps) {
    const from = Math.max(g.from, at), to = Math.min(g.to, end);
    if (to <= from) continue;
    if (from > at) pieces.push([at, from, from - at]);
    quiet.push(pieces.push([from, to, 0]) - 1);
    at = to;
  }
  if (end > at) pieces.push([at, end, end - at]);
  // Each gap's share of the strip grows with the log of its length; together they never take more than half.
  const share = quiet.map((i) => unit * Math.log(1 + (pieces[i][1] - pieces[i][0]) / 60_000));
  const sum = share.reduce((a, v) => a + v, 0);
  const squeeze = sum > 0.5 ? 0.5 / sum : 1;
  const taken = Math.min(sum, 0.5);
  const active = pieces.reduce((a, p) => a + p[2], 0) || 1;
  quiet.forEach((i, k) => { pieces[i][2] = (active * share[k] * squeeze) / (1 - taken); });
  const total = active + quiet.reduce((a, i) => a + pieces[i][2], 0) || 1;
  // Outside the window the axis carries on at the scale of its nearest piece, so callers can tell what is off screen.
  const edge = (i: number) => { const [a, b, w] = pieces[i] ?? [0, 1, 1]; return b > a ? w / (b - a) / total * 100 : 0; };
  const x = (t: number) => {
    if (t <= start) return (t - start) * edge(0);
    let shown = 0;
    for (const [a, b, w] of pieces) {
      if (t < b) return ((shown + ((t - a) / (b - a)) * w) / total) * 100;
      shown += w;
    }
    return 100 + (t - end) * edge(pieces.length - 1);
  };
  const back = (pct: number) => {
    let want = (Math.min(100, Math.max(0, pct)) / 100) * total;
    for (const [a, b, w] of pieces) {
      if (want <= w) return a + (w ? (want / w) * (b - a) : 0);
      want -= w;
    }
    return end;
  };
  return { x, at: back };
}
