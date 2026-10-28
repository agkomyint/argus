import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { laneProducts, projectProducts, sourceLanes, sources, timelines, type LaneAnalyzer, type LaneInput } from "@/db/schema";
import { newIngestKey } from "@/lib/connectors";
import { laneFeeds } from "@/lib/setup-rules";

type Kind = { input?: LaneInput; analyzer: LaneAnalyzer };

/**
 * Which lane feeds which data product. A product with links reads only its lanes' files (plus screen and
 * sensor rows, which have no file); one with no links reads the whole project. These keep the links in
 * step as lanes and products come and go, so nobody has to wire them by hand.
 */

/** A product just turned on: every lane whose analyzer it can read starts feeding it. */
export async function linkProduct(projectId: string, productId: string) {
  const lanes = await db.select({ id: sourceLanes.id, analyzer: sourceLanes.analyzer, input: sourceLanes.input }).from(sourceLanes).where(eq(sourceLanes.projectId, projectId));
  const rows = lanes.filter((l) => laneFeeds(l, productId)).map((l) => ({ laneId: l.id, projectId, productId }));
  if (rows.length) await db.insert(laneProducts).values(rows).onConflictDoNothing();
  return rows.length;
}

export async function unlinkProduct(projectId: string, productId: string) {
  await db.delete(laneProducts).where(and(eq(laneProducts.projectId, projectId), eq(laneProducts.productId, productId)));
}

/** Point a lane at these products. Anything it cannot feed, or that is not on in the project, is dropped. */
export async function setLaneFeeds(projectId: string, laneId: string, kind: Kind, feeds: string[]) {
  const on = (await db.select({ id: projectProducts.productId }).from(projectProducts).where(eq(projectProducts.projectId, projectId))).map((r) => r.id);
  const keep = [...new Set(feeds)].filter((id) => on.includes(id) && laneFeeds(kind, id));
  await db.delete(laneProducts).where(eq(laneProducts.laneId, laneId));
  if (keep.length) await db.insert(laneProducts).values(keep.map((productId) => ({ laneId, projectId, productId })));
  return keep;
}

/** The products a new lane feeds when nobody said: every product that is on and can read it. */
export async function defaultFeeds(projectId: string, kind: Kind) {
  return (await db.select({ id: projectProducts.productId }).from(projectProducts).where(eq(projectProducts.projectId, projectId))).map((r) => r.id).filter((id) => laneFeeds(kind, id));
}

/** Lanes hang off a timeline, which people no longer see. Use the first one, or make "Lanes". */
export async function laneTimeline(projectId: string) {
  const [t] = await db.select({ id: timelines.id }).from(timelines).where(eq(timelines.projectId, projectId)).orderBy(asc(timelines.createdAt)).limit(1);
  if (t) return t.id;
  const [made] = await db.insert(timelines).values({ projectId, name: "Lanes" }).returning({ id: timelines.id });
  return made.id;
}

/**
 * Make a lane and its links in one go. With no feeds given it feeds every product that can read it. A live
 * lane (screen, weather, sensor, webhook) gets its source made here too, named after the lane.
 */
export async function createLane(projectId: string, lane: Kind & { name: string; note?: string; feeds?: string[]; timelineId?: string; config?: Record<string, unknown> }) {
  const input = lane.input ?? "files";
  const timelineId = lane.timelineId ?? (await laneTimeline(projectId));
  const [source] = input === "files" ? [] : await db.insert(sources).values({ projectId, kind: input, name: lane.name, config: lane.config ?? {}, ingestKey: newIngestKey() }).returning();
  const [row] = await db.insert(sourceLanes).values({ projectId, timelineId, name: lane.name, note: lane.note ?? "", analyzer: lane.analyzer, input, sourceId: source?.id ?? null }).returning();
  const feeds = await setLaneFeeds(projectId, row.id, row, lane.feeds ?? (await defaultFeeds(projectId, row)));
  return { lane: row, source, feeds };
}

/** Remove a lane, its files and, for a live lane, the source behind it. */
export async function removeLane(projectId: string, laneId: string) {
  const [gone] = await db.delete(sourceLanes).where(and(eq(sourceLanes.id, laneId), eq(sourceLanes.projectId, projectId))).returning();
  if (gone?.sourceId) await db.delete(sources).where(and(eq(sources.id, gone.sourceId), eq(sources.projectId, projectId)));
  return gone;
}

export async function lanesFeeds(laneIds: string[]) {
  if (!laneIds.length) return new Map<string, string[]>();
  const rows = await db.select().from(laneProducts).where(inArray(laneProducts.laneId, laneIds));
  const out = new Map<string, string[]>();
  for (const r of rows) out.set(r.laneId, [...(out.get(r.laneId) ?? []), r.productId]);
  return out;
}
