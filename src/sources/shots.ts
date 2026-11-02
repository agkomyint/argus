import "server-only";
import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/db";
import { projectProducts, uploads } from "@/db/schema";
import { enqueue } from "@/lib/jobs";
import { recordObservation } from "@/lib/observations";
import { labelFootage } from "@/lib/perception";
import { s3 } from "@/lib/s3";
import { findCuts, middleFrameMs, shotsOf, type SampledFrame } from "@/lib/shot-math";
import { tlKey } from "@/lib/source-key";
import { MODEL_ID, traced } from "@/lib/trace";
import { clock } from "./video-plan";

/**
 * Shot source. Once a video's frames are stored, code compares each frame with the one before it and finds where
 * the footage cuts to something else. The Meta vision model is then shown one frame per shot and names the kind of
 * footage. Cuts and lengths are computed; only the label is proposed. Every step is traced.
 */

type Upload = typeof uploads.$inferSelect;

export const SHOT_PRODUCT = "shot-timeline";
/** Frames are compared as 16 by 9 colour pictures: enough to see a cut, too small to depend on detail. */
const GRID = { w: 16, h: 9 };

const frameTime = (up: Upload, atMs: number) => new Date(up.createdAt.getTime() + atMs);

type Stored = { atMs: number; key: string; of: number | null };

async function storedFrames(uploadId: string): Promise<Stored[]> {
  const rows = await db.execute<{ at_ms: number; key: string | null; of: number | null }>(sql`
    select (payload->>'at_ms')::int as at_ms, provenance->>'frame' as key, (payload->>'of')::int as of
    from observations where upload_id = ${uploadId} and type = 'video_frame' order by at_ms`);
  return rows.filter((r) => r.key).map((r) => ({ atMs: r.at_ms, key: r.key as string, of: r.of }));
}

/** A frame's signature: its pixels at 16 by 9, three channels, as plain numbers. */
export async function signatureOf(jpeg: Uint8Array): Promise<number[]> {
  const raw = await sharp(jpeg).resize(GRID.w, GRID.h, { fit: "fill" }).removeAlpha().raw().toBuffer();
  return [...raw];
}

/** Queue shot detection when the product is on, every planned frame is stored and the clip has none yet. Safe to call from every frame. */
export async function queueShots(up: Upload): Promise<boolean> {
  const [on] = await db.select({ id: projectProducts.productId }).from(projectProducts).where(and(eq(projectProducts.projectId, up.projectId), eq(projectProducts.productId, SHOT_PRODUCT)));
  if (!on) return false;
  const [s] = await db.execute<{ have: number; total: number | null; queued: number; done: number }>(sql`
    select (select count(*)::int from observations where upload_id = ${up.id} and type = 'video_frame') as have,
           (select max((payload->>'of')::int) from observations where upload_id = ${up.id} and type = 'video_frame') as total,
           (select count(*)::int from jobs where kind = 'detect_shots' and payload->>'uploadId' = ${up.id} and status <> 'failed') as queued,
           (select count(*)::int from observations where upload_id = ${up.id} and type = 'video_shot') as done`);
  if (!s.total || s.have < s.total || s.queued > 0 || s.done > 0) return false;
  await enqueue(up.projectId, "detect_shots", { uploadId: up.id }, { source: up.timelineId ? tlKey(up.timelineId) : "files" });
  return true;
}

/**
 * Job handler: find the cuts in one video, name each shot, and write one `video_shot` Observation per shot.
 * Safe to run again: a clip that already has shots is left alone.
 */
export async function detectShots(projectId: string, payload: Record<string, unknown>) {
  const [up] = await db.select().from(uploads).where(and(eq(uploads.id, String(payload.uploadId)), eq(uploads.projectId, projectId)));
  if (!up) return { skipped: "the video was removed" };
  const [{ n }] = await db.execute<{ n: number }>(sql`select count(*)::int as n from observations where upload_id = ${up.id} and type = 'video_shot'`);
  if (n > 0) return { skipped: "already cut into shots", shots: n };
  const frames = await storedFrames(up.id);
  if (frames.length < 2) return { skipped: "needs at least two stored frames", shots: 0 };

  const sampled = await traced(
    { kind: "code", name: "video.compare_frames", input: { file: up.filename, frames: frames.length, grid: `${GRID.w}x${GRID.h}` }, output: (r: SampledFrame[]) => ({ compared: r.length }) },
    async () => {
      const out: SampledFrame[] = [];
      for (const f of frames) {
        const file = s3.file(f.key);
        if (await file.exists()) out.push({ atMs: f.atMs, sig: await signatureOf(new Uint8Array(await file.arrayBuffer())) });
      }
      return out;
    },
  );
  if (sampled.length < 2) throw new Error("The stored frames are gone, so the video cannot be cut into shots");

  const durationMs = frames.length ? Math.max(...frames.map((f) => f.atMs)) + Math.max(0, frames[1].atMs - frames[0].atMs) : 0;
  const { cuts, shots } = await traced(
    { kind: "code", name: "video.find_cuts", input: { frames: sampled.length }, output: (r) => ({ cuts: r.cuts, shots: r.shots.length }) },
    async () => {
      const cuts = findCuts(sampled);
      return { cuts, shots: shotsOf(sampled, cuts, durationMs) };
    },
  );

  const keyAt = new Map(frames.map((f) => [f.atMs, f.key]));
  const context = `The video is "${up.filename}".`;
  const labelled: { shot: (typeof shots)[number]; frameMs: number | null; label: Awaited<ReturnType<typeof labelFootage>> | null }[] = [];
  for (const shot of shots) {
    const frameMs = middleFrameMs(shot, sampled.map((f) => f.atMs));
    const key = frameMs == null ? null : keyAt.get(frameMs);
    const file = key ? s3.file(key) : null;
    // A shot whose frame is gone is still a shot: it keeps its times and says its footage is unknown.
    const label = file && (await file.exists()) ? await labelFootage(new Uint8Array(await file.arrayBuffer()), context) : null;
    labelled.push({ shot, frameMs, label });
  }

  const ids = await traced(
    { kind: "code", name: "observations.write", input: { file: up.filename, shots: labelled.length, cuts: cuts.length }, output: (r: string[]) => ({ written: r.length }), observations: (r) => r },
    async () => {
      const out: string[] = [];
      for (const { shot, frameMs, label } of labelled) {
        out.push((await recordObservation({
          projectId,
          uploadId: up.id,
          type: "video_shot",
          eventTime: frameTime(up, shot.startMs),
          confidence: label?.confidence ?? null,
          payload: {
            shot_no: shot.no,
            start_ms: shot.startMs,
            start_after_ms: shot.startAfterMs,
            end_ms: shot.endMs,
            length_ms: shot.endMs - shot.startMs,
            frames: shot.frames,
            cut_score: Math.round(shot.score * 1000) / 1000,
            footage: label?.footage ?? "unknown",
            description: label?.description ?? "",
            at_ms: shot.startMs,
            at: clock(shot.startMs),
            end_at: clock(shot.endMs),
            file: up.filename,
            upload_id: up.id,
          },
          provenance: { connector: "video-upload", producer: label ? MODEL_ID() : "code", cuts: "code", estimate: true, video: up.id, at_ms: shot.startMs, ...(frameMs != null && keyAt.get(frameMs) ? { frame: keyAt.get(frameMs) } : {}) },
        })).id);
      }
      return out;
    },
  );
  return { frames: sampled.length, cuts: cuts.length, shots: ids.length };
}
