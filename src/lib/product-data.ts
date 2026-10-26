import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { observations } from "@/db/schema";

import type { Dataset } from "@/lib/product-types";

/** A product is its datasets (observation types) plus a widget. This loads the datasets for one project. */
export async function loadDatasets(projectId: string, types: readonly string[], limit = 500): Promise<Dataset[]> {
  if (!types.length) return [];
  const [counts, rows] = await Promise.all([
    db
      .select({ type: observations.type, n: sql<number>`count(*)::int`, latest: sql<Date | null>`max(${observations.eventTime})` })
      .from(observations)
      .where(and(eq(observations.projectId, projectId), inArray(observations.type, [...types])))
      .groupBy(observations.type),
    db
      .select()
      .from(observations)
      .where(and(eq(observations.projectId, projectId), inArray(observations.type, [...types])))
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
        .map((r) => ({ id: r.id, type, t: r.eventTime.getTime(), arrived: r.arrivalTime.getTime(), payload: r.payload }))
        .sort((a, b) => a.t - b.t),
    };
  });
}

