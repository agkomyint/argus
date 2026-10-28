import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { projectProducts, type projects } from "@/db/schema";
import type { AskProject } from "@/lib/assistant";
import { kindLabel } from "@/lib/projects";
import { getProduct } from "@/products";

/** The user's projects as Ask ARGUS lists them under @: name, kind and the data products set up. */
export async function askProjects(list: (typeof projects.$inferSelect)[]): Promise<AskProject[]> {
  const ids = list.map((p) => p.id);
  const enabled = ids.length ? await db.select().from(projectProducts).where(inArray(projectProducts.projectId, ids)).orderBy(projectProducts.enabledAt) : [];
  return list.map((p) => ({
    id: p.id,
    name: p.name,
    kind: kindLabel(p.kind),
    products: enabled.flatMap((r) => {
      const prod = r.projectId === p.id ? getProduct(r.productId) : undefined;
      return prod?.status === "supported" ? [prod.name] : [];
    }),
  }));
}
