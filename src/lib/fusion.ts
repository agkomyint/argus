import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { db } from "@/db";
import { observations } from "@/db/schema";
import { recordObservation } from "@/lib/observations";
import { BODY_REGIONS, type BodyCheck, isDay, progressOf, score } from "@/lib/body-math";
import { agreementOf, type PersonaPoint } from "@/lib/persona-math";
import { traced } from "@/lib/trace";

type Obs = typeof observations.$inferSelect;

export type Facts = {
  trigger: { id: string; type: string; label: string | null; confidence: number | null; at: string };
  asset: { id: string; name: string } | null;
  windowMinutes: number;
  vibration: { ids: string[]; count: number; windowMean: number | null; windowMax: number | null; baselineMean: number | null; ratio: number | null; unit: "mm/s" } | null;
  weather: { ids: string[]; hours: number; rainMm24h: number; maxWindKmh: number } | null;
  inspections: { id: string; at: string; rating: number | null; note: string | null }[];
  limitations: string[];
};

const MIN = 60_000;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (n: number | null, d = 2) => (n === null ? null : Number(n.toFixed(d)));

/**
 * Fusion: given one observation, gather what else is known about the same asset.
 * Time alignment = event-time window; entity alignment = asset_id (set by alias matching at ingest).
 * Everything returned carries observation ids so the final alert can cite its inputs.
 */
export async function correlate(trigger: Obs, assetName: string | null, windowMinutes = 60): Promise<Facts> {
  const limitations: string[] = [];
  const t = trigger.eventTime.getTime();
  const from = new Date(t - windowMinutes * MIN);
  const to = new Date(t + windowMinutes * MIN);
  const payload = trigger.payload as { label?: string };

  const facts: Facts = {
    trigger: { id: trigger.id, type: trigger.type, label: payload.label ?? null, confidence: trigger.confidence, at: trigger.eventTime.toISOString() },
    asset: trigger.assetId && assetName ? { id: trigger.assetId, name: assetName } : null,
    windowMinutes,
    vibration: null,
    weather: null,
    inspections: [],
    limitations,
  };

  // Weather is regional context, so it is joined by project and time, not by asset.
  const weatherRows = await db
    .select()
    .from(observations)
    .where(and(eq(observations.projectId, trigger.projectId), eq(observations.type, "weather"), gte(observations.eventTime, new Date(t - 24 * 60 * MIN)), lte(observations.eventTime, to)))
    .orderBy(asc(observations.eventTime));
  if (weatherRows.length) {
    const p = weatherRows.map((w) => w.payload as { rain_mm?: number; wind_kmh?: number });
    facts.weather = {
      ids: weatherRows.map((w) => w.id),
      hours: weatherRows.length,
      rainMm24h: round(p.reduce((a, b) => a + (b.rain_mm ?? 0), 0))!,
      maxWindKmh: round(Math.max(...p.map((b) => b.wind_kmh ?? 0)), 1)!,
    };
  } else limitations.push("No weather observations in the 24 hours before the event.");

  if (!trigger.assetId) {
    limitations.push("The detection is not matched to any asset, so sensor and inspection history could not be joined.");
    return facts;
  }

  const sensorRows = (await db
    .select()
    .from(observations)
    .where(and(eq(observations.assetId, trigger.assetId), eq(observations.type, "sensor_reading"), gte(observations.eventTime, new Date(t - 24 * 60 * MIN)), lte(observations.eventTime, to)))
    .orderBy(asc(observations.eventTime))).filter((r) => (r.payload as { metric?: string }).metric === "vibration_mm_s");
  if (sensorRows.length) {
    const val = (r: Obs) => Number((r.payload as { value?: number }).value ?? 0);
    const inWin = sensorRows.filter((r) => r.eventTime >= from && r.eventTime <= to);
    const base = sensorRows.filter((r) => r.eventTime < from);
    const wMean = mean(inWin.map(val));
    // With no earlier history, the older half of the window is the baseline; say so.
    let bMean = mean(base.map(val));
    if (bMean === null && inWin.length >= 6) {
      bMean = mean(inWin.slice(0, Math.floor(inWin.length / 2)).map(val));
      limitations.push("No vibration history before the window; the first half of the window was used as the baseline.");
    }
    if (inWin.some((r) => (r.provenance as { simulated?: boolean }).simulated)) limitations.push("Vibration readings are simulated demo data, not from a physical sensor.");
    facts.vibration = {
      ids: inWin.map((r) => r.id),
      count: inWin.length,
      windowMean: round(wMean),
      windowMax: round(inWin.length ? Math.max(...inWin.map(val)) : null),
      baselineMean: round(bMean),
      ratio: wMean !== null && bMean ? round(wMean / bMean) : null,
      unit: "mm/s",
    };
  } else limitations.push("No vibration readings for this asset around the event.");

  const insp = await db
    .select()
    .from(observations)
    .where(and(eq(observations.assetId, trigger.assetId), eq(observations.type, "inspection"), ne(observations.id, trigger.id)))
    .orderBy(desc(observations.eventTime))
    .limit(3);
  facts.inspections = insp.map((r) => {
    const p = r.payload as Record<string, unknown>;
    const rating = Number(p.rating ?? p.condition);
    return { id: r.id, at: r.eventTime.toISOString().slice(0, 10), rating: Number.isFinite(rating) ? rating : null, note: String(p.finding ?? p.findings ?? p.note ?? "") || null };
  });
  if (!insp.length) limitations.push("No inspection history for this asset.");

  return facts;
}

/** Every id and number the fused facts contain; the verifier checks model claims against these. */
export function factIndex(f: Facts) {
  const ids = new Set<string>([f.trigger.id, ...(f.vibration?.ids ?? []), ...(f.weather?.ids ?? []), ...f.inspections.map((i) => i.id)]);
  const numbers: number[] = [];
  if (f.trigger.confidence !== null) numbers.push(f.trigger.confidence, Math.round(f.trigger.confidence * 100));
  if (f.vibration) numbers.push(...[f.vibration.count, f.vibration.windowMean, f.vibration.windowMax, f.vibration.baselineMean, f.vibration.ratio].filter((n): n is number => n !== null));
  if (f.weather) numbers.push(f.weather.hours, f.weather.rainMm24h, f.weather.maxWindKmh);
  for (const i of f.inspections) if (i.rating !== null) numbers.push(i.rating);
  numbers.push(f.windowMinutes);
  return { ids, numbers };
}

/**
 * Persona fusion: compare where each simulated visitor looked on one screen. The models only gave points;
 * agreement, average clarity and how many would carry on are worked out here and stored as one Observation.
 */
export async function personaAgreement(
  projectId: string,
  uploadId: string,
  eventTime: Date,
  screen: string,
  file: string,
  views: { persona: string; clarity: number; continue: boolean; points: PersonaPoint[] }[],
) {
  if (views.length < 2) return null;
  return traced({ kind: "code", name: "fusion.persona_agreement", input: { screen, personas: views.map((v) => v.persona) }, output: (r) => r.payload, observations: (r) => [r.id] }, async () => {
    const { agreement, pairs, split } = agreementOf(views);
    const clarityAvg = Math.round((views.reduce((s, v) => s + v.clarity, 0) / views.length) * 10) / 10;
    const continueShare = Math.round((views.filter((v) => v.continue).length / views.length) * 100);
    const row = await recordObservation({
      projectId,
      uploadId,
      type: "persona_agreement",
      eventTime,
      payload: { screen, file, upload_id: uploadId, agreement, clarity_avg: clarityAvg, continue_share: continueShare, personas: views.length, split_a: split?.a ?? null, split_b: split?.b ?? null, split_score: split?.score ?? null, pairs },
      provenance: { connector: "persona-fusion", producer: "code", inputs: views.map((v) => v.persona) },
    });
    return { id: row.id, payload: row.payload, agreement };
  });
}

/**
 * Body progress: every scored photo in one lane, compared by code. The latest photo of a day wins, day 1 is
 * the baseline, and only shots the model called comparable move the trend. One body_progress row per check-in.
 */
/** Every body check-in of one lane, as the maths reads them. */
async function laneChecks(projectId: string, laneId: string) {
  const rows = await db
    .select({ id: observations.id, uploadId: observations.uploadId, payload: observations.payload, arrival: observations.arrivalTime })
    .from(observations)
    .where(and(eq(observations.projectId, projectId), eq(observations.type, "body_view")));
  const mine = rows.filter((r) => r.payload.lane_id === laneId && isDay(r.payload.day));
  const checks: BodyCheck[] = mine.map((r) => ({
    day: String(r.payload.day),
    t: r.arrival.getTime(),
    comparable: r.payload.comparable !== false,
    uploadId: r.uploadId ?? undefined,
    scores: Object.fromEntries(BODY_REGIONS.map((k) => [k, score(r.payload[k])])) as BodyCheck["scores"],
  }));
  return { mine, checks };
}

/**
 * A check-in photo was deleted: its scores go with it, and the lane's other days are measured again,
 * since day 1 or the day before may have been the one removed. Call it before the upload row goes.
 */
export async function forgetBodyPhoto(projectId: string, uploadId: string) {
  return traced({ kind: "code", name: "fusion.body_forget", input: { uploadId } }, async () => {
    const gone = await db.delete(observations)
      .where(and(eq(observations.projectId, projectId), eq(observations.uploadId, uploadId), inArray(observations.type, ["body_view", "body_progress"])))
      .returning({ payload: observations.payload });
    const lanes = [...new Set(gone.map((r) => r.payload.lane_id).filter((x): x is string => typeof x === "string"))];
    let updated = 0;
    for (const laneId of lanes) {
      const { checks } = await laneChecks(projectId, laneId);
      const rows = await db.select({ id: observations.id, payload: observations.payload }).from(observations)
        .where(and(eq(observations.projectId, projectId), eq(observations.type, "body_progress")));
      for (const r of rows.filter((x) => x.payload.lane_id === laneId && isDay(x.payload.day))) {
        const p = progressOf(checks, String(r.payload.day));
        if (p) await db.update(observations).set({ payload: { ...r.payload, ...p } }).where(eq(observations.id, r.id));
        else await db.delete(observations).where(eq(observations.id, r.id));
        updated++;
      }
    }
    return { removed: gone.length, remeasured: updated };
  });
}

export async function bodyProgress(projectId: string, uploadId: string, laneId: string, lane: string, day: string, eventTime: Date, summary: string) {
  return traced({ kind: "code", name: "fusion.body_progress", input: { lane, day }, output: (r) => r.payload, observations: (r) => [r.id] }, async () => {
    const { mine, checks } = await laneChecks(projectId, laneId);
    const p = progressOf(checks, day);
    if (!p) throw new Error(`No body check for ${day}`);
    const row = await recordObservation({
      projectId,
      uploadId,
      type: "body_progress",
      eventTime,
      payload: { ...p, lane, lane_id: laneId, upload_id: uploadId, summary },
      provenance: { connector: "body-fusion", producer: "code", inputs: mine.map((r) => r.id) },
    });
    return { id: row.id, payload: row.payload };
  });
}
