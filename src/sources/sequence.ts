import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { projectProducts, uploads } from "@/db/schema";
import { spread, verifyIncidents } from "@/lib/incident-math";
import { enqueue } from "@/lib/jobs";
import { recordObservation } from "@/lib/observations";
import { proposeIncidents, readFrameDetails } from "@/lib/perception";
import { s3 } from "@/lib/s3";
import { tlKey } from "@/lib/source-key";
import { MODEL_ID, traced } from "@/lib/trace";
import { clock } from "./video-plan";
import { queueClaims } from "./claims";

/**
 * Sequence source. Once a video's frames are stored, Muse Spark reads each frame for printed words and for
 * emergency responders, and reads a numbered run of frames for road incidents. The model points at frames;
 * code maps them to times, drops guesses that name no real frame, and writes the Observations.
 */

type Upload = typeof uploads.$inferSelect;

export const TEXT_PRODUCT = "on-screen-text";
export const RESPONSE_PRODUCT = "emergency-response";
export const INCIDENT_PRODUCT = "incident-timeline";
const PRODUCTS = [TEXT_PRODUCT, RESPONSE_PRODUCT, INCIDENT_PRODUCT];
/** One model call can look at this many frames at once. */
const INCIDENT_FRAMES = 16;

const frameTime = (up: Upload, atMs: number) => new Date(up.createdAt.getTime() + atMs);

async function enabled(projectId: string) {
  const rows = await db.select({ id: projectProducts.productId }).from(projectProducts).where(and(eq(projectProducts.projectId, projectId), inArray(projectProducts.productId, PRODUCTS)));
  return new Set(rows.map((r) => r.id));
}

/** Queue the sequence read when any of its products is on and every planned frame is stored. Safe to call from every frame. */
export async function queueSequence(up: Upload): Promise<boolean> {
  if (!(await enabled(up.projectId)).size) return false;
  const [s] = await db.execute<{ have: number; total: number | null; queued: number; done: number }>(sql`
    select (select count(*)::int from observations where upload_id = ${up.id} and type = 'video_frame') as have,
           (select max((payload->>'of')::int) from observations where upload_id = ${up.id} and type = 'video_frame') as total,
           (select count(*)::int from jobs where kind = 'read_sequence' and payload->>'uploadId' = ${up.id} and status <> 'failed') as queued,
           (select count(*)::int from observations where upload_id = ${up.id} and type in ('video_text','responder_count','video_incident')) as done`);
  if (!s.total || s.have < s.total || s.queued > 0 || s.done > 0) return false;
  await enqueue(up.projectId, "read_sequence", { uploadId: up.id }, { source: up.timelineId ? tlKey(up.timelineId) : "files" });
  return true;
}

type Stored = { atMs: number; key: string };

async function storedFrames(uploadId: string): Promise<Stored[]> {
  const rows = await db.execute<{ at_ms: number; key: string | null }>(sql`
    select (payload->>'at_ms')::int as at_ms, provenance->>'frame' as key from observations
    where upload_id = ${uploadId} and type = 'video_frame' order by at_ms`);
  return rows.filter((r) => r.key).map((r) => ({ atMs: r.at_ms, key: r.key as string }));
}

const bytesOf = async (key: string) => {
  const f = s3.file(key);
  return (await f.exists()) ? new Uint8Array(await f.arrayBuffer()) : null;
};

/** Job handler: read the frames of one video for words, responders and incidents. */
export async function readSequence(projectId: string, payload: Record<string, unknown>) {
  const [up] = await db.select().from(uploads).where(and(eq(uploads.id, String(payload.uploadId)), eq(uploads.projectId, projectId)));
  if (!up) return { skipped: "the video was removed" };
  const [{ n }] = await db.execute<{ n: number }>(sql`select count(*)::int as n from observations where upload_id = ${up.id} and type in ('video_text','responder_count','video_incident')`);
  if (n > 0) return { skipped: "already read", observations: n };
  const on = await enabled(projectId);
  const frames = await storedFrames(up.id);
  if (!frames.length) return { skipped: "no stored frames" };
  const context = `The video is "${up.filename}".`;
  const written: string[] = [];
  const base = (type: string, atMs: number, body: Record<string, unknown>, confidence: number | null, provenance: Record<string, unknown>) =>
    recordObservation({
      projectId, uploadId: up.id, type, eventTime: frameTime(up, atMs), confidence,
      payload: { ...body, at_ms: atMs, at: clock(atMs), file: up.filename, upload_id: up.id },
      provenance: { connector: "video-upload", producer: MODEL_ID(), video: up.id, at_ms: atMs, ...provenance },
    });

  if (on.has(TEXT_PRODUCT) || on.has(RESPONSE_PRODUCT)) {
    for (const f of frames) {
      const bytes = await bytesOf(f.key);
      if (!bytes) continue;
      const read = await readFrameDetails(bytes, context);
      const ids = await traced(
        { kind: "code", name: "observations.write", input: { file: up.filename, at_ms: f.atMs }, output: (r: string[]) => ({ written: r.length }), observations: (r) => r },
        async () => {
          const out: string[] = [];
          if (on.has(TEXT_PRODUCT)) for (const t of read.text.filter((x) => x.text.trim())) out.push((await base("video_text", f.atMs, { text: t.text.trim(), where: t.where }, read.confidence, { frame: f.key })).id);
          if (on.has(RESPONSE_PRODUCT)) out.push((await base("responder_count", f.atMs, { vehicles: read.responders.vehicles, people: read.responders.people, responders: read.responders.vehicles + read.responders.people }, read.confidence, { frame: f.key, estimate: true })).id);
          return out;
        },
      );
      written.push(...ids);
    }
  }

  let incidents = 0;
  if (on.has(INCIDENT_PRODUCT)) {
    const loaded: { n: number; bytes: Uint8Array; atMs: number; key: string }[] = [];
    for (const f of spread(frames.length, INCIDENT_FRAMES).map((i) => frames[i])) {
      const bytes = await bytesOf(f.key);
      if (bytes) loaded.push({ n: loaded.length + 1, bytes, atMs: f.atMs, key: f.key });
    }
    if (loaded.length) {
      const proposals = await proposeIncidents(loaded.map((l) => ({ n: l.n, bytes: l.bytes })), context);
      const { kept, dropped } = await traced(
        { kind: "code", name: "video.verify_incidents", input: { proposed: proposals.length, frames: loaded.length }, output: (r) => ({ kept: r.kept.length, dropped: r.dropped }) },
        async () => verifyIncidents(proposals, loaded.map((l) => l.atMs)),
      );
      const ids = await traced(
        { kind: "code", name: "observations.write", input: { file: up.filename, incidents: kept.length, dropped: dropped.length }, output: (r: string[]) => ({ written: r.length }), observations: (r) => r },
        async () => {
          const out: string[] = [];
          for (const k of kept) {
            out.push((await base("video_incident", k.atMs, { kind: k.kind, title: `${clock(k.atMs)} ${k.kind}: ${k.description}`, description: k.description, frame_no: k.frame }, k.confidence, { frame: loaded[k.frame - 1].key, estimate: true, verified: "frame number exists" })).id);
          }
          return out;
        },
      );
      incidents = ids.length;
      written.push(...ids);
    }
  }
  await queueClaims(projectId);
  return { frames: frames.length, observations: written.length, incidents };
}
