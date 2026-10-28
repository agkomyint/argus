import { and, desc, eq, inArray, isNotNull, isNull, notInArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { laneProducts, observations, sourceLanes, uploads } from "@/db/schema";

import type { Dataset } from "@/lib/product-types";

/** A product is its datasets (observation types) plus a widget. This loads the datasets for one project. */
export async function loadDatasets(projectId: string, types: readonly string[], limit = 500, lanes?: string[] | null): Promise<Dataset[]> {
  if (!types.length) return [];
  const where = and(eq(observations.projectId, projectId), inArray(observations.type, [...types]), laneFilter(projectId, lanes));
  const [counts, rows] = await Promise.all([
    db
      .select({ type: observations.type, n: sql<number>`count(*)::int`, latest: sql<Date | null>`max(${observations.eventTime})` })
      .from(observations)
      .where(where)
      .groupBy(observations.type),
    db
      .select()
      .from(observations)
      .where(where)
      .orderBy(desc(observations.eventTime))
      .limit(limit),
  ]);
  return types.map((type) => {
    const c = counts.find((x) => x.type === type);
    return {
      type,
      total: c?.n ?? 0,
      latest: c?.latest ? new Date(c.latest).getTime() : null,
      rows: rows
        .filter((r) => r.type === type)
        .map((r) => ({ id: r.id, type, t: r.eventTime.getTime(), arrived: r.arrivalTime.getTime(), payload: r.payload, confidence: r.confidence }))
        .sort((a, b) => a.t - b.t),
    };
  });
}


/**
 * Rows from a lane only count when that lane feeds the product: rows from its files, and rows a live lane's
 * source wrote (weather, a sensor, a webhook). Rows with neither (frames from a screen share) and files from
 * before lanes always count. No lanes given means the product has no links yet and reads the whole project.
 */
function laneFilter(projectId: string, lanes?: string[] | null): SQL | undefined {
  if (!lanes) return undefined;
  const elsewhere = db.select({ id: uploads.id }).from(uploads).where(and(eq(uploads.projectId, projectId), isNotNull(uploads.laneId), lanes.length ? notInArray(uploads.laneId, lanes) : undefined));
  const liveElsewhere = db.select({ id: sourceLanes.sourceId }).from(sourceLanes).where(and(eq(sourceLanes.projectId, projectId), isNotNull(sourceLanes.sourceId), lanes.length ? notInArray(sourceLanes.id, lanes) : undefined));
  return and(
    or(isNull(observations.uploadId), notInArray(observations.uploadId, elsewhere)),
    or(isNull(observations.sourceId), notInArray(observations.sourceId, liveElsewhere)),
  );
}

/** The lanes linked to each product of a project. A product missing here has no links and reads everything. */
export async function productLanes(projectId: string): Promise<Map<string, string[]>> {
  const rows = await db.select({ laneId: laneProducts.laneId, productId: laneProducts.productId }).from(laneProducts).where(eq(laneProducts.projectId, projectId));
  const out = new Map<string, string[]>();
  for (const r of rows) out.set(r.productId, [...(out.get(r.productId) ?? []), r.laneId]);
  return out;
}

/** One product's datasets, read only from the lanes that feed it. */
export async function loadProductData(projectId: string, product: { id: string; observationTypes: readonly string[] }, limit = 500, lanes?: Map<string, string[]>) {
  const map = lanes ?? (await productLanes(projectId));
  return loadDatasets(projectId, product.observationTypes, limit, map.get(product.id) ?? null);
}
