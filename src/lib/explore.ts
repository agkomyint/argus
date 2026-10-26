import "server-only";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { observations, projectProducts, projects, user } from "@/db/schema";
import { getProduct } from "@/products";

/**
 * Projects their owners chose to show on /explore. Only what the share dialog promises leaves here:
 * the project name, its products and their rows, and the replay. Never email, files, frames or keys.
 */
const sharedCols = { id: projects.id, slug: projects.shareSlug, name: projects.name, kind: projects.kind, agentLevel: projects.agentLevel, frequency: projects.frequency, createdAt: projects.createdAt, sharedAt: projects.sharedAt, owner: user.name };

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "Someone";

async function productsOf(ids: string[]) {
  if (!ids.length) return new Map<string, NonNullable<ReturnType<typeof getProduct>>[]>();
  const rows = await db.select().from(projectProducts).where(inArray(projectProducts.projectId, ids)).orderBy(projectProducts.enabledAt);
  const out = new Map<string, NonNullable<ReturnType<typeof getProduct>>[]>();
  for (const r of rows) {
    const p = getProduct(r.productId);
    if (p?.status === "supported") out.set(r.projectId, [...(out.get(r.projectId) ?? []), p]);
  }
  return out;
}

export async function listShared(limit = 48) {
  const rows = await db.select(sharedCols).from(projects).innerJoin(user, eq(user.id, projects.userId)).where(isNotNull(projects.sharedAt)).orderBy(desc(projects.sharedAt)).limit(limit);
  const ids = rows.map((r) => r.id);
  const [prods, counts] = await Promise.all([
    productsOf(ids),
    ids.length ? db.select({ id: observations.projectId, n: sql<number>`count(*)::int` }).from(observations).where(inArray(observations.projectId, ids)).groupBy(observations.projectId) : [],
  ]);
  return rows.map((r) => ({
    slug: r.slug!,
    name: r.name,
    kind: r.kind,
    owner: firstName(r.owner),
    sharedAt: r.sharedAt!,
    products: (prods.get(r.id) ?? []).map((p) => p.name),
    rows: counts.find((c) => c.id === r.id)?.n ?? 0,
  }));
}

export async function getShared(slug: string) {
  const [r] = await db.select(sharedCols).from(projects).innerJoin(user, eq(user.id, projects.userId)).where(and(eq(projects.shareSlug, slug), isNotNull(projects.sharedAt)));
  if (!r) return null;
  const prods = await productsOf([r.id]);
  return { ...r, owner: firstName(r.owner), products: prods.get(r.id) ?? [] };
}
