import "server-only";
import { and, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { jobs, sourceLanes, sources, uploads } from "@/db/schema";
import { liveReady } from "@/lib/setup-rules";
import type { StudioLane } from "@/components/studio/lane-drop";

const IMAGE = /\.(jpe?g|png|webp|gif|avif)$/i;

/**
 * The project's lanes for the studio's Sources dock and drop targets: how many files each holds, how many
 * are still being read, its latest photo as a thumbnail, and for a live lane whether it is set up.
 */
export async function studioLanes(projectId: string): Promise<StudioLane[]> {
  const uid = sql<string>`${jobs.payload}->>'uploadId'`;
  const [lanes, live, files, reading, latest] = await Promise.all([
    db.select().from(sourceLanes).where(eq(sourceLanes.projectId, projectId)).orderBy(sourceLanes.createdAt),
    db.select({ id: sources.id, kind: sources.kind, config: sources.config, lastSeenAt: sources.lastSeenAt }).from(sources).where(eq(sources.projectId, projectId)),
    db.select({ laneId: uploads.laneId, n: count() }).from(uploads).where(and(eq(uploads.projectId, projectId), isNotNull(uploads.laneId))).groupBy(uploads.laneId),
    db.select({ laneId: uploads.laneId, n: sql<number>`count(distinct ${uploads.id})::int` }).from(jobs)
      .innerJoin(uploads, eq(sql`${uploads.id}::text`, uid))
      .where(and(eq(jobs.projectId, projectId), inArray(jobs.status, ["queued", "running"]), isNotNull(uploads.laneId)))
      .groupBy(uploads.laneId),
    db.selectDistinctOn([uploads.laneId], { id: uploads.id, laneId: uploads.laneId }).from(uploads)
      .where(and(eq(uploads.projectId, projectId), isNotNull(uploads.laneId), eq(uploads.status, "ready"), sql`${uploads.filename} ~* ${IMAGE.source}`))
      .orderBy(uploads.laneId, desc(uploads.createdAt)),
  ]);
  return lanes.map((l) => {
    const thumb = latest.find((t) => t.laneId === l.id);
    const src = live.find((s) => s.id === l.sourceId);
    return {
      id: l.id,
      name: l.name,
      analyzer: l.analyzer,
      input: l.input,
      live: src ? { ready: liveReady(src), last: src.lastSeenAt?.toISOString().slice(11, 16) } : undefined,
      files: files.find((f) => f.laneId === l.id)?.n ?? 0,
      reading: reading.find((r) => r.laneId === l.id)?.n ?? 0,
      thumb: thumb ? `/api/studio/${projectId}/media/${thumb.id}` : undefined,
    };
  });
}
