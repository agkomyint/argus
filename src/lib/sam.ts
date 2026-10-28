import "server-only";
import { sql } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { drainJobs, enqueue } from "@/lib/jobs";
import { s3 } from "@/lib/s3";
import { tlKey } from "@/lib/source-key";
import { getProduct } from "@/products";
import { modelFor } from "@/lib/models";
import { recordObservation, type NewObservation } from "@/lib/observations";
import { readSam, type SamResult } from "@/lib/sam-geometry";
import { traced } from "@/lib/trace";

/** The longest side sent to SAM. Boxes come back in the pixels sent, so this is also the frame the outlines live in. */
const SEND_WIDTH = 1024;
/** SAM is called once per concept, so a busy picture is capped to the labels that matter most. */
export const MAX_CONCEPTS = 4;
const MAX_PER_CONCEPT = 12;

/** True when a product the project has on reads where objects are, so a SAM call is worth its cost. */
export const wantsMasks = (productIds: string[]) => productIds.some((id) => getProduct(id)?.observationTypes.includes("object_mask"));

async function shrink(bytes: Uint8Array): Promise<{ bytes: Uint8Array; mediaType: string }> {
  try {
    const { default: sharp } = await import(/* turbopackIgnore: true */ "sharp");
    const out = await sharp(bytes).rotate().resize({ width: SEND_WIDTH, height: SEND_WIDTH, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    return { bytes: new Uint8Array(out), mediaType: "image/jpeg" };
  } catch {
    // Not a picture sharp reads, or sharp is missing: send it as it came. SAM still says the frame size it saw.
    return { bytes, mediaType: "image/jpeg" };
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** A SAM answer takes a few seconds. One that takes this long is stuck, and fails so its worker moves on. */
const CALL_LIMIT_MS = 60_000;

async function call(body: string): Promise<Response> {
  const url = `${process.env.META_BASE_URL ?? "https://api.meta.ai/v1"}/responses`;
  const init = () => ({ method: "POST", headers: { Authorization: `Bearer ${process.env.META_API_KEY}`, "Content-Type": "application/json", "User-Agent": "argus-demo/0.1" }, body, signal: AbortSignal.timeout(CALL_LIMIT_MS) });
  const r = await fetch(url, init());
  if (r.status !== 429) return r;
  // Busy: wait as long as asked (within reason) and try once more.
  const retry = Number(r.headers.get("retry-after"));
  await wait(Math.min(Number.isFinite(retry) && retry > 0 ? retry * 1000 : 1500, 5000));
  return fetch(url, init());
}

/**
 * Ask SAM where one concept is in a picture. One concept per call: SAM reads "truck", not "truck, crane".
 * It answers with boxes and masks in special tokens, which code reads; an empty answer means none were found.
 */
export async function segment(image: Uint8Array, concept: string): Promise<SamResult> {
  const sent = await shrink(image);
  const model = modelFor("segment");
  const text = await traced(
    { kind: "model", name: "sam.segment", model, input: { concept, image: sent.bytes }, output: (t: string) => ({ found: (t.match(/<\|mask;/g) ?? []).length, chars: t.length, images_processed: 1 }) },
    async () => {
      const r = await call(JSON.stringify({
        model,
        input: [{ type: "message", role: "user", content: [{ type: "input_text", text: concept }, { type: "input_image", image_url: `data:${sent.mediaType};base64,${Buffer.from(sent.bytes).toString("base64")}` }] }],
        metadata: { include_confidence: "true" },
      }));
      if (!r.ok) throw new Error(`SAM answered ${r.status}${r.status === 429 ? " (busy)" : ""}`);
      const j = (await r.json()) as { output?: { content?: { text?: string }[] }[] };
      return j.output?.[0]?.content?.[0]?.text ?? "";
    },
  );
  return traced(
    { kind: "code", name: "sam.read_masks", input: { concept, chars: text.length }, output: (s: SamResult) => ({ size: [s.width, s.height], objects: s.instances.length, warnings: s.warnings }) },
    () => readSam(text),
  );
}

export type Located = { label: string; x: number; y: number; box: [number, number, number, number]; frame: [number, number]; area_pct: number; outline: string | null; confidence: number | null; sam_object_id: string };

/** Turn one SAM answer into rows: where each object is, as a share of the frame, so frames of any size compare. */
export function placements(label: string, s: SamResult): Located[] {
  if (!s.width || !s.height) return [];
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  return s.instances.slice(0, MAX_PER_CONCEPT).map((i) => ({
    label,
    x: r3((i.box[0] + i.box[2]) / 2 / s.width),
    y: r3((i.box[1] + i.box[3]) / 2 / s.height),
    box: i.box,
    frame: [s.width, s.height],
    area_pct: Math.round((i.areaPx / (s.width * s.height)) * 10000) / 100,
    outline: i.outline,
    confidence: i.confidence,
    sam_object_id: i.objectId,
  }));
}

/** The distinct labels worth locating, most confident first. "none" is not a thing to look for. */
export function conceptsOf(findings: { label: string; confidence: number }[]): string[] {
  const best = new Map<string, number>();
  for (const f of findings) {
    const k = f.label.trim().toLowerCase();
    if (!k || k === "none") continue;
    best.set(k, Math.max(best.get(k) ?? 0, f.confidence));
  }
  return [...best].sort((a, b) => b[1] - a[1]).slice(0, MAX_CONCEPTS).map(([k]) => k);
}

type Base = Omit<NewObservation, "type" | "payload" | "confidence">;

/**
 * Spark names, SAM locates. For each label Spark gave, SAM finds every instance and code writes one
 * `object_mask` row per instance with its box, outline, centre and share of the frame. A concept SAM
 * cannot place is skipped, and one failed call never loses the rest: the step is still in the Observatory.
 */
export async function locate(image: Uint8Array, findings: { label: string; confidence: number }[], base: Base, extra: Record<string, unknown>): Promise<string[]> {
  if (!process.env.META_API_KEY) return [];
  const found: Located[] = [];
  for (const concept of conceptsOf(findings)) {
    try {
      found.push(...placements(concept, await segment(image, concept)));
    } catch {
      // Recorded by traced() with its error; the picture keeps its other rows.
    }
  }
  if (!found.length) return [];
  const producer = modelFor("segment");
  return traced(
    { kind: "code", name: "observations.write", input: { masks: found.length, labels: [...new Set(found.map((f) => f.label))] }, output: (r: string[]) => ({ written: r.length }), observations: (r) => r },
    async () => {
      const ids: string[] = [];
      for (const { confidence, ...f } of found) {
        const row = await recordObservation({
          ...base,
          type: "object_mask",
          confidence,
          payload: { ...f, object_class: f.label, ...extra },
          provenance: { ...base.provenance, producer, estimate: true },
        });
        ids.push(row.id);
      }
      return ids;
    },
  );
}

/** Most pictures one product switch sends to SAM, so turning a product on never runs up an open-ended bill. */
const MAX_PAST = 200;

/**
 * A product that reads positions was just turned on: every picture Spark already read, but SAM has not,
 * is queued to be located, using the labels Spark gave then. Photos and video frames alike; nothing is re-read.
 */
export async function queuePastPictures(projectId: string) {
  return traced(
    { kind: "code", name: "sam.queue_past", input: { projectId }, output: (n: number) => ({ queued: n, cap: MAX_PAST }) },
    async () => {
      const rows = await db.execute<{ upload_id: string; frame: string | null; timeline_id: string | null }>(sql`
        select distinct d.upload_id, d.provenance->>'frame' as frame, u.timeline_id
        from observations d join uploads u on u.id = d.upload_id
        where d.project_id = ${projectId} and d.type = 'object_detected'
          and not exists (
            select 1 from observations m where m.upload_id = d.upload_id and m.type = 'object_mask'
              and (m.provenance->>'frame') is not distinct from (d.provenance->>'frame'))
          -- Switching a product off and on again before its jobs ran queues nothing twice.
          and not exists (
            select 1 from jobs j where j.project_id = d.project_id and j.kind = 'locate_objects' and j.status in ('queued', 'running', 'paused')
              and j.payload->>'uploadId' = d.upload_id::text and (j.payload->>'frame') is not distinct from (d.provenance->>'frame'))
        limit ${MAX_PAST}`);
      // Queued without a drain each: one drain for the lot, or every job starts its own workers and they
      // crowd the database's connections, slowing every other page that shares them.
      for (const r of rows) await enqueue(projectId, "locate_objects", { uploadId: r.upload_id, ...(r.frame ? { frame: r.frame } : {}) }, { source: r.timeline_id ? tlKey(r.timeline_id) : "files", drain: false });
      if (rows.length) after(() => drainJobs());
      return rows.length;
    },
  );
}

/** Job handler: locate the objects Spark already named in one past picture. Writes beside them, never over them. */
export async function locateLater(projectId: string, payload: Record<string, unknown>) {
  const uploadId = String(payload.uploadId);
  const frame = typeof payload.frame === "string" ? payload.frame : null;
  const named = await db.execute<{ label: string; confidence: number | null; event_time: Date; payload: Record<string, unknown>; provenance: Record<string, unknown>; key: string; masks: number }>(sql`
    select coalesce(d.payload->>'object_class', d.payload->>'label') as label, d.confidence, d.event_time, d.payload, d.provenance, u.key,
      (select count(*)::int from observations m where m.upload_id = d.upload_id and m.type = 'object_mask'
        and (m.provenance->>'frame') is not distinct from ${frame}) as masks
    from observations d join uploads u on u.id = d.upload_id
    where d.project_id = ${projectId} and d.upload_id = ${uploadId} and d.type = 'object_detected'
      and (d.provenance->>'frame') is not distinct from ${frame}`);
  if (!named.length) return { skipped: "nothing named in this picture" };
  // A retried job, or a picture a newer run already placed.
  if (named[0].masks > 0) return { skipped: "already located" };
  const file = s3.file(frame ?? named[0].key);
  if (!(await file.exists())) return { skipped: "the picture is gone" };
  const first = named[0];
  // Where the picture came from carries over; who produced the row is SAM, set by locate().
  const provenance = Object.fromEntries(Object.entries(first.provenance).filter(([k]) => k !== "producer"));
  const keep = ["file", "upload_id", "lane", "at", "at_ms"];
  const extra = Object.fromEntries(keep.filter((k) => first.payload[k] !== undefined).map((k) => [k, first.payload[k]]));
  const ids = await locate(
    new Uint8Array(await file.arrayBuffer()),
    named.map((n) => ({ label: n.label, confidence: n.confidence ?? 0 })),
    { projectId, uploadId, eventTime: new Date(first.event_time), provenance: { ...provenance, located_later: true } },
    extra,
  );
  return { masks: ids.length };
}
