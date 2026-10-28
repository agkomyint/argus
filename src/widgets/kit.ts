import type { FlatRow } from "@/widgets/schema";

/** Series colours, in order. Widgets with several parts cycle through these. */
/**
 * Charts ease from the old values to the new ones when rows arrive, instead of jumping.
 * Recharts keeps the previous points and tweens to the next set, so nothing is redrawn from zero.
 */
export const ANIM = { isAnimationActive: true, animationDuration: 450, animationEasing: "ease-out" } as const;

/** The same feel for hand-drawn bars: sizes tween, and a new bar grows up from the baseline. */
export const GROW = "transition-[height,width,opacity,transform] duration-500 ease-out starting:scale-y-0 origin-bottom";

export const PALETTE = ["var(--electric)", "var(--signal)", "var(--muted-foreground)", "var(--chart-3)", "var(--chart-4)"] as const;

/** First bound field that holds a number, then the usual suspects, else the fallback. */
export function val(r: FlatRow, fields: string[], fallback = 0): number {
  for (const f of [...fields, "count", "value", "confidence"]) {
    const v = r[f];
    if (v !== undefined && v !== null && v !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return fallback;
}

export const text = (r: FlatRow, fields: string[], fallback = ""): string => {
  for (const f of [...fields, "title", "event", "label", "class", "name"]) {
    const v = r[f];
    if (typeof v === "string" && v) return v;
  }
  return fallback;
};

/** Deterministic wave, so samples look the same on every render (no hydration drift). */
export const wave = (n: number, base: number, amp: number, phase = 0) =>
  Array.from({ length: n }, (_, i) => Math.max(0, Math.round(base + amp * Math.sin(i / 3 + phase) + amp * 0.4 * Math.sin(i * 1.7 + phase))));

/** Fixed start for sample rows, so server and client agree. */
export const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);
export const sampleTimes = (n: number, stepMs = 10_000) => Array.from({ length: n }, (_, i) => T0 + i * stepMs);

export const HIDE = { hide: true } as const;

/** When a row happened, as a person reads it: the second of the clip for video rows ("00:12"), else the clock time. */
/**
 * A key that stays with a row as more rows arrive, so a list adds the new one instead of building every line
 * again. Rows that look the same are told apart by how many came before.
 */
export function rowKeys(rows: FlatRow[], parts: (r: FlatRow) => unknown[] = () => []): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const k = [r.t, r.type, ...parts(r)].map(String).join("|");
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    return n ? `${k}#${n}` : k;
  });
}

export const moment = (r: FlatRow): string => (typeof r.at === "string" && r.at ? r.at : new Date(r.t).toISOString().slice(11, 16));
