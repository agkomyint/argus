import "server-only";
import { and, count, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { jobs, observations, sourceLanes, uploads } from "@/db/schema";
import { stuckOf, type StuckFile } from "@/lib/pipeline-state";
import { isVideoFile } from "@/sources/video-plan";

/** Every file in the project that stopped part way, with what to do about it, and how many files there are in all. */
export async function loadStuck(projectId: string): Promise<{ items: StuckFile[]; total: number }> {
  const files = await db.select().from(uploads).where(and(eq(uploads.projectId, projectId), isNotNull(uploads.laneId)));
  if (!files.length) return { items: [], total: 0 };
  const ids = files.map((f) => f.id);
  const uid = sql<string>`${jobs.payload}->>'uploadId'`;
  const [lanes, work, framed] = await Promise.all([
    db.select({ id: sourceLanes.id, name: sourceLanes.name, input: sourceLanes.input }).from(sourceLanes).where(eq(sourceLanes.projectId, projectId)),
    db.select({ id: uid, status: jobs.status, source: jobs.source }).from(jobs).where(and(eq(jobs.projectId, projectId), inArray(uid, ids))),
    db.select({ id: observations.uploadId, have: count(), total: sql<number | null>`max((${observations.payload}->>'of')::int)` }).from(observations).where(and(inArray(observations.uploadId, ids), eq(observations.type, "video_frame"))).groupBy(observations.uploadId),
  ]);

  const now = Date.now();
  const items = files.flatMap((f) => {
    const lane = lanes.find((l) => l.id === f.laneId);
    if (!lane) return [];
    const mine = work.filter((w) => w.id === f.id);
    const video = isVideoFile(f.filename) && lane.input !== "camera";
    const fr = framed.find((r) => r.id === f.id);
    const stuck = stuckOf({
      status: f.status,
      ageMs: now - f.createdAt.getTime(),
      video,
      frames: video ? { have: fr?.have ?? 0, total: fr?.total ?? null } : undefined,
      jobs: mine.map((w) => w.status),
    });
    if (!stuck) return [];
    const source = stuck.kind === "paused" ? mine.find((w) => w.status === "paused")?.source ?? undefined : undefined;
    return [{ ...stuck, id: f.id, laneId: lane.id, lane: lane.name, filename: f.filename, source }];
  });
  return { items, total: files.length };
}
