import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { assetAliases, assets, observations, sources } from "@/db/schema";

export type NewObservation = {
  projectId: string;
  sourceId?: string | null;
  uploadId?: string | null;
  type: string;
  eventTime: Date;
  /** Name or alias as the source spelled it. Matched to an asset when possible. */
  assetName?: string | null;
  payload?: Record<string, unknown>;
  confidence?: number | null;
  provenance?: Record<string, unknown>;
};

const norm = (s: string) => s.trim().toLowerCase();

/** Entity matching: exact name, then alias. Returns null when unmatched (kept visible in the UI). */
export async function matchAsset(projectId: string, name: string) {
  const key = norm(name);
  const [byName] = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.projectId, projectId), sql`lower(${assets.name}) = ${key}`));
  if (byName) return byName.id;
  const [byAlias] = await db
    .select({ id: assetAliases.assetId })
    .from(assetAliases)
    .where(and(eq(assetAliases.projectId, projectId), sql`lower(${assetAliases.alias}) = ${key}`));
  return byAlias?.id ?? null;
}

/** Find an asset whose name or alias appears inside free text such as a filename. */
export async function findAssetInText(projectId: string, text: string) {
  const hay = norm(text).replace(/[_\s]+/g, "-");
  const rows = await db
    .select({ id: assets.id, name: assets.name })
    .from(assets)
    .where(eq(assets.projectId, projectId));
  const aliasRows = await db
    .select({ id: assetAliases.assetId, name: assetAliases.alias })
    .from(assetAliases)
    .where(eq(assetAliases.projectId, projectId));
  for (const r of [...rows, ...aliasRows]) {
    if (hay.includes(norm(r.name).replace(/[_\s]+/g, "-"))) return r.id;
  }
  return null;
}

export async function upsertAsset(projectId: string, name: string, extra: { kind?: string; lat?: number | null; lng?: number | null; aliases?: string[] } = {}) {
  const [row] = await db
    .insert(assets)
    .values({ projectId, name, kind: extra.kind ?? "asset", lat: extra.lat ?? null, lng: extra.lng ?? null })
    .onConflictDoUpdate({ target: [assets.projectId, assets.name], set: { lat: extra.lat ?? sql`${assets.lat}`, lng: extra.lng ?? sql`${assets.lng}` } })
    .returning();
  for (const alias of extra.aliases ?? []) {
    if (alias.trim()) await db.insert(assetAliases).values({ projectId, assetId: row.id, alias: alias.trim() }).onConflictDoNothing();
  }
  return row;
}

export async function recordObservation(o: NewObservation) {
  const assetId = o.assetName ? await matchAsset(o.projectId, o.assetName) : null;
  const [row] = await db
    .insert(observations)
    .values({
      projectId: o.projectId,
      sourceId: o.sourceId ?? null,
      uploadId: o.uploadId ?? null,
      assetId,
      type: o.type,
      eventTime: o.eventTime,
      payload: { ...(o.payload ?? {}), ...(o.assetName && !assetId ? { unmatched_asset: o.assetName } : {}) },
      confidence: o.confidence ?? null,
      provenance: o.provenance ?? {},
    })
    .returning();
  if (o.sourceId) await db.update(sources).set({ lastSeenAt: new Date() }).where(eq(sources.id, o.sourceId));
  return row;
}
