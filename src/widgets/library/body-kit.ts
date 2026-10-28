import { BODY_REGIONS, clearChange, type BodyRegion } from "@/lib/body-math";
import { PALETTE } from "@/widgets/kit";
import type { FlatRow } from "@/widgets/schema";

// Shared by the body widgets so each area keeps one colour everywhere.
export const REGION_COLOR: Record<BodyRegion, string> = {
  abs: PALETTE[0],
  chest: PALETTE[1],
  arms: PALETTE[3],
  shoulders: PALETTE[4],
  legs: "var(--chart-5, var(--chart-2))",
  back: PALETTE[2],
};

export const REGION_LABEL: Record<BodyRegion, string> = { abs: "Abs", chest: "Chest", arms: "Arms", shoulders: "Shoulders", legs: "Legs", back: "Back" };

export const scoreOf = (r: FlatRow | undefined, k: BodyRegion) => {
  const n = Number(r?.[k]);
  return r && r[k] !== null && Number.isFinite(n) && n >= 1 ? n : null;
};

export const deltaOf = (v: unknown, k: BodyRegion) => {
  const n = v && typeof v === "object" ? Number((v as Record<string, unknown>)[k]) : NaN;
  return v && typeof v === "object" && (v as Record<string, unknown>)[k] !== null && Number.isFinite(n) ? n : null;
};

export const signed = (n: number | null) => (n === null ? "–" : n > 0 ? `+${n}` : n === 0 ? "±0" : `${n}`);

/** Colour for a change: only a clear one (bigger than the model's repeat noise) is green or red. */
export const deltaTone = (n: number | null) => (!clearChange(n) ? "text-muted-foreground" : n > 0 ? "text-signal" : "text-destructive");

/** The headline words for a change since day 1. */
export const sinceDay1 = (n: number | null) => (n === null ? "no change measured yet" : clearChange(n) ? `${signed(n)} since day 1` : `about the same as day 1 (${signed(n)})`);

/** One row per lane and day: a second photo of the same day replaces the first. Oldest day first. */
export function checkins(rows: FlatRow[]) {
  const by = new Map<string, FlatRow>();
  for (const r of rows) {
    if (typeof r.day !== "string") continue;
    const k = `${String(r.lane_id ?? r.lane ?? "")}|${r.day}`;
    const had = by.get(k);
    if (!had || r.t >= had.t) by.set(k, r);
  }
  return [...by.values()].sort((a, b) => String(a.day).localeCompare(String(b.day)));
}

/** Lanes by how many days they have, most first. */
export function lanesOf(rows: FlatRow[]) {
  const n = new Map<string, { id: string; name: string; days: number }>();
  for (const r of rows) {
    const id = String(r.lane_id ?? r.lane ?? "");
    const l = n.get(id) ?? { id, name: String(r.lane ?? "Photos"), days: 0 };
    l.days++;
    n.set(id, l);
  }
  return [...n.values()].sort((a, b) => b.days - a.days);
}

export const regionsIn = (rows: FlatRow[]) => BODY_REGIONS.filter((k) => rows.some((r) => scoreOf(r, k) !== null));

export const shortDay = (d: unknown) => (typeof d === "string" ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "");

export const ESTIMATE = "Visual estimates from your photos, not a body-fat measurement or health advice. A change of 1 point is within the model's repeat noise.";
