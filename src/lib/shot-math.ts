// Shot boundaries from sampled frames. Plain code, no model: a model may later name what a shot shows,
// but where one shot ends and the next begins is arithmetic over pixels.

/** A small grayscale picture of one frame, 0 to 255 per cell, read row by row. */
export type Signature = readonly number[];

export type SampledFrame = { atMs: number; sig: Signature };

/** A cut lies somewhere after `afterMs` (the last frame of the old shot) and at or before `atMs` (the first frame of the new one). */
export type Cut = { afterMs: number; atMs: number; score: number };

export type Shot = {
  no: number;
  /** First sampled second of this shot. The true cut is up to `startAfterMs`-to-`startMs` earlier. */
  startMs: number;
  /** Last sampled second we know belonged to the previous shot; equals startMs for the first shot. */
  startAfterMs: number;
  endMs: number;
  frames: number;
  /** How different the first frame was from the one before it, 0 to 1. Zero for the first shot. */
  score: number;
};

/** Mean absolute difference between two signatures, 0 (identical) to 1 (black against white). */
export function distance(a: Signature, b: Signature): number {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i]);
  return sum / n / 255;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((x, y) => x - y);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export type CutOptions = {
  /** A step this big is always a cut. */
  floor?: number;
  /** A step must also be this many times the clip's usual frame-to-frame change. */
  times?: number;
};

/**
 * Cuts between neighbouring sampled frames. A step counts when it passes the floor and is clearly larger than
 * the clip's usual change, so a shaky dashcam does not cut at every frame. Frames two seconds apart can miss a
 * shot shorter than the gap, and a slow dissolve may not be seen at all.
 */
export function findCuts(frames: readonly SampledFrame[], { floor = 0.2, times = 2.5 }: CutOptions = {}): Cut[] {
  const sorted = [...frames].sort((a, b) => a.atMs - b.atMs);
  const steps = sorted.slice(1).map((f, i) => ({ afterMs: sorted[i].atMs, atMs: f.atMs, score: distance(sorted[i].sig, f.sig) }));
  const usual = median(steps.map((s) => s.score));
  return steps.filter((s) => s.score >= floor && s.score >= usual * times);
}

/** The shots between the cuts. Every sampled frame belongs to exactly one shot; the last shot ends at the clip's end. */
export function shotsOf(frames: readonly SampledFrame[], cuts: readonly Cut[], durationMs: number): Shot[] {
  const times = frames.map((f) => f.atMs).sort((a, b) => a - b);
  if (!times.length) return [];
  const bounds = [...cuts].sort((a, b) => a.atMs - b.atMs);
  const starts = [{ startMs: times[0], startAfterMs: times[0], score: 0 }, ...bounds.map((c) => ({ startMs: c.atMs, startAfterMs: c.afterMs, score: c.score }))];
  return starts.map((s, i) => {
    const endMs = i + 1 < starts.length ? starts[i + 1].startMs : Math.max(durationMs, times[times.length - 1]);
    return { no: i + 1, ...s, endMs, frames: times.filter((t) => t >= s.startMs && t < endMs).length, score: s.score };
  });
}

/** The sampled time nearest the middle of a shot: the frame to show a model when it is asked what the shot is. */
export function middleFrameMs(shot: Pick<Shot, "startMs" | "endMs">, times: readonly number[]): number | null {
  const inside = times.filter((t) => t >= shot.startMs && t < shot.endMs);
  if (!inside.length) return null;
  const mid = (shot.startMs + shot.endMs) / 2;
  return inside.reduce((best, t) => (Math.abs(t - mid) < Math.abs(best - mid) ? t : best));
}

/** Share of the clip each footage kind fills, longest first. Lengths come from the shots, not from a model. */
export function footageShare(shots: readonly { footage: string; startMs: number; endMs: number }[]): { footage: string; ms: number; share: number }[] {
  const by = new Map<string, number>();
  for (const s of shots) by.set(s.footage, (by.get(s.footage) ?? 0) + Math.max(0, s.endMs - s.startMs));
  const total = [...by.values()].reduce((a, b) => a + b, 0);
  return [...by].map(([footage, ms]) => ({ footage, ms, share: total ? ms / total : 0 })).sort((a, b) => b.ms - a.ms);
}
