import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { projectProducts, sourceLanes, uploads } from "@/db/schema";
import { enabledCaptureProducts } from "@/lib/capture";
import { enqueue } from "@/lib/jobs";
import { recordObservation } from "@/lib/observations";
import { perceiveImage, perceiveScene } from "@/lib/perception";
import { conceptsOf, locate, MAX_VIDEO_BYTES, segmentVideo, wantsMasks } from "@/lib/sam";
import { trackSummary } from "@/lib/sam-video-geometry";
import { s3 } from "@/lib/s3";
import { tlKey } from "@/lib/source-key";
import { MODEL_ID, traced } from "@/lib/trace";
import { queueSequence } from "./sequence";
import { queueShots } from "./shots";
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

/** Which seconds of this clip are already stored, and how many the sampler planned. The sampling stage of a file. */
export async function sampledFrames(uploadId: string) {
  const rows = await db.execute<{ at_ms: number; total: number | null }>(sql`
    select (payload->>'at_ms')::int as at_ms, (payload->>'of')::int as total
    from observations where upload_id = ${uploadId} and type = 'video_frame'`);
  const have = rows.map((r) => r.at_ms).sort((x, y) => x - y);
  const totals = rows.map((r) => r.total).filter((t): t is number => t != null);
  return { have, total: totals.length ? Math.max(...totals) : null };
}

/**
 * One frame from the browser: store it, record it, queue it. Returns null when the clip already has MAX_FRAMES.
 * Safe to send again: a second of the clip that already has its frame is not stored twice, and if its analysis was
 * never queued (the first try stopped between the two), it is queued now. `total` is how many frames the
 * sampler planned for the clip, kept on each frame so a half-sampled file can be told from a finished one.
 */
export async function storeVideoFrame(up: Upload, atMs: number, bytes: Uint8Array, total?: number) {
  const key = frameKey(up, atMs);
  const [seen] = await db.execute<{ id: string }>(sql`select id from observations where upload_id = ${up.id} and type = 'video_frame' and (payload->>'at_ms')::int = ${atMs} limit 1`);
  const source = { source: up.timelineId ? tlKey(up.timelineId) : "files" };
  if (seen) {
    const [queued] = await db.execute<{ id: string }>(sql`select id from jobs where project_id = ${up.projectId} and kind = 'analyze_video_frame' and payload->>'key' = ${key} limit 1`);
    if (!queued) await enqueue(up.projectId, "analyze_video_frame", { uploadId: up.id, key, atMs }, source);
    return { key, observationId: seen.id, already: true };
  }
  const [{ n }] = await db.execute<{ n: number }>(sql`select count(*)::int as n from observations where upload_id = ${up.id} and type = 'video_frame'`);
  if (n >= MAX_FRAMES) return null;
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
        payload: { at_ms: atMs, at: clock(atMs), file: up.filename, upload_id: up.id, ...(total ? { of: total } : {}) },
        provenance: { connector: "video-upload", sampler: "browser", video: up.id, at_ms: atMs, frame: key },
      });
    },
  );
  await enqueue(up.projectId, "analyze_video_frame", { uploadId: up.id, key, atMs }, source);
  await queueShots(up);
  await queueSequence(up);
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
  // A lane that reads the whole clip gets its outlines from SAM video later, which follows each object by id.
  const clip = lane?.videoRead === "clip";
  if (clip) await queueTracking(up, key);
  const masks = !clip && (await wantsMasksIn(projectId)) ? await locate(bytes, findings, base, { file: up.filename, ...at, ...(lane ? { lane: lane.name } : {}) }) : [];
  return { at: clock(atMs), people: scene?.people ?? null, findings: findings.length, observations: ids.length + masks.length };
}

/**
 * Once every planned frame is stored and no other frame of the clip is still being read, queue one tracking job.
 * Safe to call from every frame: a clip that already has a tracking job is not queued again.
 */
async function queueTracking(up: Upload, key: string) {
  const [s] = await db.execute<{ have: number; total: number | null; busy: number; queued: number }>(sql`
    select (select count(*)::int from observations where upload_id = ${up.id} and type = 'video_frame') as have,
           (select max((payload->>'of')::int) from observations where upload_id = ${up.id} and type = 'video_frame') as total,
           (select count(*)::int from jobs where kind = 'analyze_video_frame' and payload->>'uploadId' = ${up.id} and status in ('queued','running') and payload->>'key' <> ${key}) as busy,
           (select count(*)::int from jobs where kind = 'track_video' and payload->>'uploadId' = ${up.id} and status <> 'failed') as queued`);
  if (!s.total || s.have < s.total || s.busy > 0 || s.queued > 0) return false;
  await enqueue(up.projectId, "track_video", { uploadId: up.id }, { source: up.timelineId ? tlKey(up.timelineId) : "files" });
  return true;
}

/**
 * Job handler: send the whole clip to SAM once per thing Spark named, and write one `object_track` per object SAM
 * followed. The id comes from SAM, so one chair stays one chair. Safe to run again: a clip that already has tracks
 * is left alone. Waits (by failing, so the queue retries) while frames are still being read, since the things
 * to follow come from those reads.
 */
export async function trackVideo(projectId: string, payload: Record<string, unknown>) {
  const [up] = await db.select().from(uploads).where(and(eq(uploads.id, String(payload.uploadId)), eq(uploads.projectId, projectId)));
  if (!up) return { skipped: "the video was removed" };
  const [{ n }] = await db.execute<{ n: number }>(sql`select count(*)::int as n from observations where upload_id = ${up.id} and type = 'object_track'`);
  if (n > 0) return { skipped: "already tracked", tracks: n };
  const [{ busy }] = await db.execute<{ busy: number }>(sql`select count(*)::int as busy from jobs where kind = 'analyze_video_frame' and payload->>'uploadId' = ${up.id} and status in ('queued','running')`);
  if (busy > 0) throw new Error("Some frames are still being read; tracking waits for them");
  const found = await db.execute<{ label: string; confidence: number | null }>(sql`select payload->>'label' as label, confidence from observations where upload_id = ${up.id} and type = 'object_detected'`);
  const concepts = conceptsOf(found.map((f) => ({ label: f.label, confidence: f.confidence ?? 0 })));
  if (!concepts.length) return { skipped: "nothing to follow", tracks: 0 };
  const file = s3.file(up.key);
  if (!(await file.exists())) throw new Error("The original video is gone, so it cannot be tracked");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_VIDEO_BYTES) throw new Error("This clip is too large to track as video");
  const [lane] = up.laneId ? await db.select().from(sourceLanes).where(eq(sourceLanes.id, up.laneId)) : [];
  let written = 0;
  let billed = 0;
  for (const concept of concepts) {
    const r = await segmentVideo(bytes, concept, up.filename);
    billed += r.billedFrames;
    const ids = await traced(
      { kind: "code", name: "video.write_tracks", input: { file: up.filename, concept, objects: r.tracks.length }, output: (o: string[]) => ({ written: o.length }), observations: (o) => o },
      async () => {
        const out: string[] = [];
        for (const t of r.tracks) {
          const sum = trackSummary(t);
          out.push((await recordObservation({
            projectId,
            uploadId: up.id,
            type: "object_track",
            eventTime: frameTime(up, 0),
            confidence: sum.confidence ?? undefined,
            payload: { label: concept, object_class: concept, sam_object_id: sum.objectId, first_frame: sum.first, last_frame: sum.last, frames_seen: sum.seen, gaps: sum.gaps, file: up.filename, upload_id: up.id, ...(lane ? { lane: lane.name } : {}) },
            provenance: { connector: "video-upload", producer: "sam.video", estimate: true, video: up.id, concept },
          })).id);
        }
        return out;
      },
    );
    written += ids.length;
  }
  return { concepts: concepts.length, tracks: written, billedFrames: billed };
}

/** Delete a video's sampled frames from storage, for when the video itself is deleted. */
export async function dropVideoFrames(uploadId: string) {
  const rows = await db.execute<{ key: string }>(sql`select distinct provenance->>'frame' as key from observations where upload_id = ${uploadId} and provenance ? 'frame'`);
  await Promise.all(rows.map((r) => s3.file(r.key).delete().catch(() => {})));
  await db.execute(sql`update observations set provenance = provenance - 'frame' where upload_id = ${uploadId} and provenance ? 'frame'`);
  return rows.length;
}
