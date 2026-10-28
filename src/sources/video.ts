import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { projectProducts, sourceLanes, uploads } from "@/db/schema";
import { enabledCaptureProducts } from "@/lib/capture";
import { enqueue } from "@/lib/jobs";
import { recordObservation } from "@/lib/observations";
import { perceiveImage, perceiveScene } from "@/lib/perception";
import { locate, wantsMasks } from "@/lib/sam";
import { s3 } from "@/lib/s3";
import { tlKey } from "@/lib/source-key";
import { MODEL_ID, traced } from "@/lib/trace";
import { clock, MAX_FRAMES } from "./video-plan";

/**
 * Video source. The browser samples the clip (see browser-video.ts) and sends one JPEG per planned second.
 * Each frame is stored, written as a `video_frame` Observation at its second of the video, and queued for
 * the Meta models. What they find is written as Observations stamped with the same second, so a replay
 * can follow the video clock. Every step is traced.
 */

type Upload = typeof uploads.$inferSelect;

export const frameKey = (up: Pick<Upload, "id" | "projectId">, atMs: number) => `${up.projectId}/frames/${up.id}/${String(atMs).padStart(9, "0")}.jpg`;

const frameTime = (up: Upload, atMs: number) => new Date(up.createdAt.getTime() + atMs);

const wantsMasksIn = async (projectId: string) => wantsMasks((await db.select({ id: projectProducts.productId }).from(projectProducts).where(eq(projectProducts.projectId, projectId))).map((r) => r.id));

/** One frame from the browser: store it, record it, queue it. Returns null when the clip already has MAX_FRAMES. */
export async function storeVideoFrame(up: Upload, atMs: number, bytes: Uint8Array) {
  const [{ n }] = await db.execute<{ n: number }>(sql`select count(*)::int as n from observations where upload_id = ${up.id} and type = 'video_frame'`);
  if (n >= MAX_FRAMES) return null;
  const key = frameKey(up, atMs);
  const row = await traced(
    { kind: "code", name: "video.store_frame", input: { file: up.filename, at: clock(atMs), image: bytes }, output: (o) => ({ frame: key, observation: o.id }), observations: (o) => [o.id] },
    async () => {
      await s3.write(key, bytes, { type: "image/jpeg" });
      // The frame itself is an Observation, so the replay has a picture for every tick even when the models find nothing.
      return recordObservation({
        projectId: up.projectId,
        uploadId: up.id,
        type: "video_frame",
        eventTime: frameTime(up, atMs),
        payload: { at_ms: atMs, at: clock(atMs), file: up.filename, upload_id: up.id },
        provenance: { connector: "video-upload", sampler: "browser", video: up.id, at_ms: atMs, frame: key },
      });
    },
  );
  await enqueue(up.projectId, "analyze_video_frame", { uploadId: up.id, key, atMs }, { source: up.timelineId ? tlKey(up.timelineId) : "files" });
  return { key, observationId: row.id };
}

/** Job handler: one sampled frame through the Meta models, written as Observations at its second of the video. */
export async function analyzeVideoFrame(projectId: string, payload: Record<string, unknown>) {
  const key = String(payload.key);
  const atMs = Number(payload.atMs);
  const [up] = await db.select().from(uploads).where(and(eq(uploads.id, String(payload.uploadId)), eq(uploads.projectId, projectId)));
  if (!up) return { skipped: "the video was removed" };
  const file = s3.file(key);
  if (!(await file.exists())) return { skipped: "frame is gone" };
  const bytes = new Uint8Array(await file.arrayBuffer());

  // People counts when a capture product is on; objects and damage always, as with photos.
  const capture = await enabledCaptureProducts(projectId);
  const [lane] = up.laneId ? await db.select().from(sourceLanes).where(eq(sourceLanes.id, up.laneId)) : [];
  const context = `This is the frame at ${clock(atMs)} of the video "${up.filename}".${lane ? ` The person labelled this lane "${lane.name}"${lane.note ? `: ${lane.note}` : ""}.` : ""}`;
  const scene = capture.length ? await perceiveScene(bytes, capture.includes("attribute-breakdown")) : null;
  const findings = (await perceiveImage(bytes, "image/jpeg", context)).filter((f) => f.label.toLowerCase() !== "none");

  const at = { at_ms: atMs, at: clock(atMs), upload_id: up.id };
  const base = {
    projectId,
    uploadId: up.id,
    eventTime: frameTime(up, atMs),
    provenance: { connector: "video-upload", producer: MODEL_ID(), estimate: true, video: up.id, at_ms: atMs, frame: key },
  };
  const ids = await traced(
    { kind: "code", name: "observations.write", input: { at: clock(atMs), people: scene?.people ?? null, findings: findings.length }, output: (r) => ({ written: r.length }), observations: (r) => r },
    async () => {
      const out: string[] = [];
      if (scene && capture.includes("people-count")) out.push((await recordObservation({ ...base, type: "people_count", payload: { count: scene.people, ...at } })).id);
      if (scene?.apparent) out.push((await recordObservation({ ...base, type: "attribute_breakdown", payload: { ...scene.apparent, ...at } })).id);
      for (const f of findings) {
        out.push((await recordObservation({
          ...base,
          type: f.kind === "object" ? "object_detected" : "defect_detected",
          confidence: f.confidence,
          payload: { label: f.label, ...(f.kind === "object" ? { object_class: f.label.toLowerCase() } : {}), description: f.description, file: up.filename, ...at, ...(lane ? { lane: lane.name } : {}) },
        })).id);
      }
      return out;
    },
  );
  const masks = (await wantsMasksIn(projectId)) ? await locate(bytes, findings, base, { file: up.filename, ...at, ...(lane ? { lane: lane.name } : {}) }) : [];
  return { at: clock(atMs), people: scene?.people ?? null, findings: findings.length, observations: ids.length + masks.length };
}

/** Delete a video's sampled frames from storage, for when the video itself is deleted. */
export async function dropVideoFrames(uploadId: string) {
  const rows = await db.execute<{ key: string }>(sql`select distinct provenance->>'frame' as key from observations where upload_id = ${uploadId} and provenance ? 'frame'`);
  await Promise.all(rows.map((r) => s3.file(r.key).delete().catch(() => {})));
  await db.execute(sql`update observations set provenance = provenance - 'frame' where upload_id = ${uploadId} and provenance ? 'frame'`);
  return rows.length;
}
