import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { projectProducts, projects } from "@/db/schema";
import { recordObservation } from "@/lib/observations";
import { perceiveScene } from "@/lib/perception";
import { s3 } from "@/lib/s3";

export const CAPTURE_PRODUCTS = ["people-count", "attribute-breakdown"] as const;
export const MAX_QUEUED_FRAMES = 15;

export async function enabledCaptureProducts(projectId: string) {
  const rows = await db
    .select({ id: projectProducts.productId })
    .from(projectProducts)
    .where(and(eq(projectProducts.projectId, projectId), inArray(projectProducts.productId, [...CAPTURE_PRODUCTS])));
  return rows.map((r) => r.id);
}

/** Delete every screen-share frame kept for /explore (video frames stay with their video) and unlink it from its rows. The counts stay. */
export async function dropKeptFrames(projectId: string) {
  const rows = await db.execute<{ key: string }>(sql`select distinct provenance->>'frame' as key from observations where project_id = ${projectId} and provenance ? 'frame' and provenance->>'connector' = 'screen-share'`);
  await Promise.all(rows.map((r) => s3.file(r.key).delete().catch(() => {})));
  await db.execute(sql`update observations set provenance = provenance - 'frame' where project_id = ${projectId} and provenance ? 'frame' and provenance->>'connector' = 'screen-share'`);
  return rows.length;
}

/** Job handler: read one stored frame, estimate counts, record them as observations, then delete the frame (unless media is shared). */
export async function analyzeFrame(projectId: string, payload: Record<string, unknown>) {
  const key = String(payload.key);
  const file = s3.file(key);
  if (!(await file.exists())) return { skipped: "frame is gone (stopped or already processed)" };

  const enabled = await enabledCaptureProducts(projectId);
  if (!enabled.length) {
    await file.delete();
    return { skipped: "no capture product is enabled" };
  }
  const wantAttributes = enabled.includes("attribute-breakdown");
  const scene = await perceiveScene(new Uint8Array(await file.arrayBuffer()), wantAttributes);

  // A frame is kept only if the owner agreed to show media on /explore; otherwise it goes once read.
  const [proj] = await db.select({ shareMedia: projects.shareMedia }).from(projects).where(eq(projects.id, projectId));
  const keep = !!proj?.shareMedia;

  const eventTime = new Date(Number(payload.capturedAt));
  const base = { projectId, eventTime, provenance: { connector: "screen-share", producer: process.env.META_MODEL ?? "muse-spark-1.3", estimate: true, ...(keep ? { frame: key } : {}) } };
  if (enabled.includes("people-count")) await recordObservation({ ...base, type: "people_count", payload: { count: scene.people, session: payload.session } });
  if (wantAttributes && scene.apparent) await recordObservation({ ...base, type: "attribute_breakdown", payload: { ...scene.apparent, session: payload.session } });

  if (!keep) await file.delete();
  return { people: scene.people, kept: keep };
}
