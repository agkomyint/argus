/**
 * The arithmetic behind a daily body check-in. The model only scores what it sees in one photo; everything
 * that compares days (baseline, change, streak) is plain code here so it is the same every time.
 */

export const BODY_REGIONS = ["abs", "chest", "arms", "shoulders", "legs", "back"] as const;
export type BodyRegion = (typeof BODY_REGIONS)[number];
export type BodyScores = Record<BodyRegion, number | null>;

/** One scored photo: the day it belongs to, when it was scored, and whether it matches day 1's shot. */
export type BodyCheck = { day: string; t: number; comparable: boolean; scores: BodyScores; uploadId?: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const isDay = (s: unknown): s is string => typeof s === "string" && DAY.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
export const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const dayNo = (s: string) => Math.round(Date.parse(`${s}T00:00:00Z`) / 86_400_000);

/** A score the model gave, made safe: 1..10 rounded, anything else (0 = not visible) is null. */
export const score = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.min(10, Math.round(n)) : null;
};

/** Re-uploading a day replaces it: the latest photo for each day wins. Oldest day first. */
export function latestPerDay(checks: BodyCheck[]): BodyCheck[] {
  const by = new Map<string, BodyCheck>();
  for (const c of checks) {
    const had = by.get(c.day);
    if (!had || c.t >= had.t) by.set(c.day, c);
  }
  return [...by.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** Days in a row with a check-in, ending at the last logged day. */
export function streakOf(days: string[]): number {
  const nos = [...new Set(days.filter(isDay).map(dayNo))].sort((a, b) => b - a);
  let n = nos.length ? 1 : 0;
  while (n < nos.length && nos[n - 1] - nos[n] === 1) n++;
  return n;
}

const diff = (now: BodyScores, then: BodyScores | undefined) =>
  Object.fromEntries(BODY_REGIONS.map((r) => [r, then && now[r] !== null && then[r] !== null ? now[r]! - then[r]! : null])) as BodyScores;

/**
 * Where one day stands. Day 1 is the first logged day; changes are only measured against comparable shots,
 * so a photo from a different angle or light is shown but does not move the trend.
 */
export function progressOf(checks: BodyCheck[], day: string) {
  const days = latestPerDay(checks.filter((c) => c.day <= day));
  const today = days.find((c) => c.day === day);
  if (!today) return null;
  const baseline = days[0];
  const prev = [...days].reverse().find((c) => c.day < day && c.comparable);
  const counts = today.comparable && baseline.day !== day;
  return {
    day,
    baseline_day: baseline.day,
    baseline_upload_id: baseline.uploadId ?? null,
    prev_day: prev?.day ?? null,
    comparable: today.comparable,
    ...today.scores,
    vs_prev: counts && prev ? diff(today.scores, prev.scores) : null,
    vs_day1: counts ? diff(today.scores, baseline.scores) : null,
    days_logged: days.length,
    streak: streakOf(days.map((c) => c.day)),
  };
}

/**
 * The model scores the same photo up to a point apart on repeat calls, so a change of one point is not evidence
 * of anything. Only a bigger move counts as a clear change; widgets show the rest as "about the same".
 */
export const NOISE = 1;
export const clearChange = (d: number | null | undefined): d is number => typeof d === "number" && Math.abs(d) > NOISE;

/** The products a body lane feeds. */
export const BODY_PRODUCTS = ["body-progress", "body-compare", "checkin-streak"] as const;
