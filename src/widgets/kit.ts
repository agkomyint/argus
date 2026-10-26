import type { FlatRow } from "@/widgets/schema";

/** Series colours, in order. Widgets with several parts cycle through these. */
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
