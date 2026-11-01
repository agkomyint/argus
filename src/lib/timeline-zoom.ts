/** The part of the replay the timeline is showing, in real time. */
export type View = { from: number; to: number };

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
/** The closest the timeline can be zoomed: no tighter than this many ms across. */
export const MIN_VIEW = 5 * SECOND;

/** Keep a window inside the whole replay and at least MIN_VIEW wide, moving it rather than squeezing it. */
export function fit(view: View, start: number, end: number): View {
  const whole = Math.max(end - start, 1);
  const width = Math.min(whole, Math.max(Math.min(MIN_VIEW, whole), view.to - view.from));
  const from = Math.min(end - width, Math.max(start, view.from));
  return { from, to: from + width };
}

/** Zoom by `factor` (below 1 zooms in) keeping `anchor` where it is on the strip. Null when it shows everything. */
export function zoomAround(view: View, start: number, end: number, factor: number, anchor: number): View | null {
  const width = view.to - view.from;
  const ratio = (anchor - view.from) / (width || 1);
  const next = width * factor;
  const v = fit({ from: anchor - ratio * next, to: anchor - ratio * next + next }, start, end);
  return v.to - v.from >= end - start - 1 ? null : v;
}

/** Slide the window by `ms`, stopping at the ends of the replay. */
export function panBy(view: View, start: number, end: number, ms: number): View {
  return fit({ from: view.from + ms, to: view.to + ms }, start, end);
}

const STEPS = [1, 2, 5, 10, 15, 30].map((s) => s * SECOND).concat([1, 2, 5, 10, 15, 30].map((m) => m * MINUTE), [1, 2, 3, 6, 12, 24].map((h) => h * HOUR));

/** The gap between ruler ticks: the smallest round step that leaves about `target` ticks across the window. */
export function tickStep(width: number, target = 7): number {
  return STEPS.find((s) => width / s <= target) ?? STEPS[STEPS.length - 1];
}

/** Round times for the ruler within a window, leaving out any that fall inside a quiet gap. */
export function rulerTicks(view: View, gaps: readonly { from: number; to: number }[], target = 7): { t: number; step: number }[] {
  const step = tickStep(view.to - view.from, target);
  const out: { t: number; step: number }[] = [];
  for (let t = Math.ceil(view.from / step) * step; t <= view.to; t += step) {
    if (!gaps.some((g) => t > g.from && t < g.to)) out.push({ t, step });
  }
  return out;
}
