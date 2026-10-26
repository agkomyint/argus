import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { observations, sourceLanes, sources, uploads } from "@/db/schema";
import { parseCsv } from "@/lib/csv";
import { enqueue } from "@/lib/jobs";
import { findAssetInText, recordObservation, upsertAsset } from "@/lib/observations";
import { perceiveImage } from "@/lib/perception";
import { s3 } from "@/lib/s3";
import { extensionOf } from "@/lib/uploads";
import { srcKey } from "@/lib/source-key";

export const newIngestKey = () => `ak_${randomBytes(18).toString("base64url")}`;

const pick = (row: Record<string, string>, names: string[]) => names.map((n) => row[n]).find((v) => v !== undefined && v !== "");
const num = (v: string | undefined) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);

// ---------- file uploads ----------

/** CSV / JSON become observations (or assets); images go through the perception agent. */
export async function processUpload(uploadId: string) {
  const [up] = await db.select().from(uploads).where(eq(uploads.id, uploadId));
  if (!up || up.status !== "ready") throw new Error("Upload not found or not complete");
  const ext = extensionOf(up.filename);
  const file = s3.file(up.key);

  if (ext === "csv") return importRows(up.projectId, up.id, up.filename, parseCsv(await file.text()));
  if (ext === "json") {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data) ? data : Array.isArray(data?.records) ? data.records : null;
    if (!list) return { skipped: "JSON must be an array of records" };
    const rows = list.map((r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase(), v == null ? "" : String(v)])));
    return importRows(up.projectId, up.id, up.filename, rows);
  }
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const assetId = await findAssetInText(up.projectId, up.filename);
    const [lane] = up.laneId ? await db.select().from(sourceLanes).where(eq(sourceLanes.id, up.laneId)) : [];
    const laneHint = lane ? ` The person labelled this lane "${lane.name}"${lane.note ? `: ${lane.note}` : ""}.` : "";
    const findings = await perceiveImage(bytes, up.contentType || `image/${ext === "jpg" ? "jpeg" : ext}`, (assetId ? "The frame shows a known monitored asset." : "The monitored asset is not identified.") + laneHint);
    let created = 0;
    for (const f of findings.filter((f) => f.label.toLowerCase() !== "none")) {
      const [asset] = assetId ? await db.execute<{ name: string }>(sql`select name from assets where id = ${assetId}`) : [];
      await recordObservation({
        projectId: up.projectId,
        uploadId: up.id,
        // Objects feed the object detection dataset; damage feeds inspections and alerts.
        type: f.kind === "object" ? "object_detected" : "defect_detected",
        eventTime: up.createdAt,
        assetName: asset?.name ?? null,
        confidence: f.confidence,
        payload: { label: f.label, ...(f.kind === "object" ? { object_class: f.label.toLowerCase() } : {}), description: f.description, file: up.filename, upload_id: up.id, ...(lane ? { lane: lane.name } : {}) },
        provenance: { connector: "image-upload", producer: process.env.META_MODEL ?? "muse-spark-1.3" },
      });
      created++;
    }
    return { detections: created, frames: 1 };
  }
  return { skipped: `No connector for .${ext} yet` };
}

async function importRows(projectId: string, uploadId: string, filename: string, rows: Record<string, string>[]) {
  if (rows.length === 0) return { rows: 0 };
  const cols = Object.keys(rows[0]);
  const isAssetList = cols.includes("name") && (cols.includes("lat") || cols.includes("latitude") || cols.includes("aliases") || cols.includes("kind")) && !cols.some((c) => ["date", "timestamp", "time", "observed_at", "rating"].includes(c));

  if (isAssetList) {
    for (const r of rows) {
      if (!r.name) continue;
      await upsertAsset(projectId, r.name, { kind: r.kind || undefined, lat: num(pick(r, ["lat", "latitude"])), lng: num(pick(r, ["lng", "lon", "longitude"])), aliases: (r.aliases ?? "").split("|") });
    }
    return { assets: rows.length };
  }

  let written = 0;
  let unmatched = 0;
  for (const r of rows) {
    const when = pick(r, ["observed_at", "timestamp", "time", "date", "datetime"]);
    const t = when ? new Date(when) : new Date();
    if (Number.isNaN(t.getTime())) continue;
    const assetName = pick(r, ["asset", "asset_id", "pier", "sensor", "location", "name"]);
    const isInspection = cols.some((c) => ["rating", "condition", "finding", "findings"].includes(c));
    const obs = await recordObservation({
      projectId,
      uploadId,
      type: isInspection ? "inspection" : "record",
      eventTime: t,
      assetName,
      payload: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, num(v) ?? v])),
      provenance: { connector: "file-upload", file: filename },
    });
    written++;
    if (assetName && !obs.assetId) unmatched++;
  }
  return { observations: written, unmatched_assets: unmatched };
}

// ---------- scheduled sources ----------

export async function pollSource(sourceId: string) {
  const [src] = await db.select().from(sources).where(eq(sources.id, sourceId));
  if (!src) throw new Error("Source not found");
  if (src.kind === "weather") return pollWeather(src);
  if (src.kind === "sensor_sim") return emitSimulatedSensor(src);
  return { skipped: `Source kind ${src.kind} is push-only` };
}

async function pollWeather(src: typeof sources.$inferSelect) {
  const { lat, lng, asset } = src.config as { lat: number; lng: number; asset?: string };
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=precipitation,wind_speed_10m&past_days=1&forecast_days=1&timezone=UTC`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`);
  const j = (await res.json()) as { hourly: { time: string[]; precipitation: (number | null)[]; wind_speed_10m: (number | null)[] } };
  const now = Date.now();
  let written = 0;
  for (let i = 0; i < j.hourly.time.length; i++) {
    const t = new Date(`${j.hourly.time[i]}:00Z`);
    if (t.getTime() > now) continue;
    const [dup] = await db.select({ id: observations.id }).from(observations).where(and(eq(observations.sourceId, src.id), eq(observations.eventTime, t)));
    if (dup) continue;
    await recordObservation({
      projectId: src.projectId,
      sourceId: src.id,
      type: "weather",
      eventTime: t,
      assetName: asset ?? null,
      payload: { rain_mm: j.hourly.precipitation[i] ?? 0, wind_kmh: j.hourly.wind_speed_10m[i] ?? 0 },
      provenance: { connector: "rest-poller", provider: "open-meteo", lat, lng },
    });
    written++;
  }
  return { observations: written };
}

/** Clearly labelled simulation: one reading a minute for the last hour, optionally with a vibration surge. */
async function emitSimulatedSensor(src: typeof sources.$inferSelect) {
  const { asset, surge } = src.config as { asset?: string; surge?: boolean };
  const now = Date.now();
  let written = 0;
  for (let m = 60; m >= 0; m--) {
    const t = new Date(now - m * 60_000);
    t.setSeconds(0, 0);
    const [dup] = await db.select({ id: observations.id }).from(observations).where(and(eq(observations.sourceId, src.id), eq(observations.eventTime, t)));
    if (dup) continue;
    const base = 2 + Math.sin(m / 5) * 0.3 + (Math.random() - 0.5) * 0.2;
    const value = surge && m <= 10 ? base + 3.5 + Math.random() * 0.8 : base;
    await recordObservation({
      projectId: src.projectId,
      sourceId: src.id,
      type: "sensor_reading",
      eventTime: t,
      assetName: asset ?? null,
      payload: { metric: "vibration_mm_s", value: Number(value.toFixed(2)) },
      provenance: { connector: "simulated-sensor", simulated: true },
    });
    written++;
  }
  return { observations: written, simulated: true };
}

/** Used by actions: enqueue a poll and let the worker run it. */
export const queuePoll = (projectId: string, sourceId: string) => enqueue(projectId, "poll_source", { sourceId }, { source: srcKey(sourceId) });
