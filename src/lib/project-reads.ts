import "server-only";
import { eq, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { observations, projectProducts } from "@/db/schema";
import { getProduct } from "@/products";

// Reads that several parts of one page need (the studio asks for the same rows from the engine, the replay
// and every setup window). React's cache() runs each once per request, so they cost one query, not five.

/** The project's product rows, in the order they were added. */
export const enabledRows = cache((projectId: string) =>
  db.select().from(projectProducts).where(eq(projectProducts.projectId, projectId)).orderBy(projectProducts.enabledAt),
);

/** The project's supported data products, in the order they were added. */
export const enabledProducts = cache(async (projectId: string) =>
  (await enabledRows(projectId)).flatMap((r) => {
    const p = getProduct(r.productId);
    return p?.status === "supported" ? [p] : [];
  }),
);

/** How many Observations of each type the project holds. */
export const typeCounts = cache((projectId: string) =>
  db.select({ type: observations.type, n: sql<number>`count(*)::int` }).from(observations).where(eq(observations.projectId, projectId)).groupBy(observations.type),
);
