import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { observations, sources, timelines, uploads } from "@/db/schema";
import type { SourceKind } from "@/lib/product-sources";

/** Is each kind of source linked to this project, meaning it has been connected or has already delivered data. */
export async function loadLinked(projectId: string): Promise<Record<SourceKind, boolean>> {
  const [[files], [screen], connected, [tl]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(uploads).where(and(eq(uploads.projectId, projectId), eq(uploads.status, "ready"))),
    db.select({ n: sql<number>`count(*)::int` }).from(observations).where(and(eq(observations.projectId, projectId), inArray(observations.type, ["people_count", "attribute_breakdown"]))),
    db.select({ kind: sources.kind }).from(sources).where(eq(sources.projectId, projectId)),
    db.select({ n: sql<number>`count(*)::int` }).from(timelines).where(eq(timelines.projectId, projectId)),
  ]);
  return {
    files: files.n > 0 || tl.n > 0,
    screen: screen.n > 0 || connected.some((s) => s.kind === "screen"),
    sensor: connected.some((s) => s.kind === "sensor_sim" || s.kind === "webhook"),
    weather: connected.some((s) => s.kind === "weather"),
  };
}
