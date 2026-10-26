import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";

/**
 * Personal API keys for agents that cannot run the OAuth browser sign-in. A key acts as its owner,
 * on their own projects only. Only a SHA-256 hash is stored; the key is shown once, when made.
 */
export const KEY_PREFIX = "argus_sk_";
const hash = (key: string) => createHash("sha256").update(key).digest("hex");

export async function createApiKey(userId: string, name: string) {
  const key = KEY_PREFIX + randomBytes(24).toString("base64url");
  const [row] = await db
    .insert(apiKeys)
    .values({ userId, name: name.trim().slice(0, 60) || "Coding agent", prefix: key.slice(0, KEY_PREFIX.length + 4), hash: hash(key) })
    .returning({ id: apiKeys.id });
  return { id: row.id, key };
}

export const listApiKeys = (userId: string) =>
  db
    .select({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, lastUsedAt: apiKeys.lastUsedAt, createdAt: apiKeys.createdAt })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(desc(apiKeys.createdAt));

export const revokeApiKey = (userId: string, id: string) => db.delete(apiKeys).where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)));

/** The user id a bearer key belongs to, or null. */
export async function userForApiKey(key: string) {
  if (!key.startsWith(KEY_PREFIX)) return null;
  const [row] = await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.hash, hash(key))).returning({ userId: apiKeys.userId });
  return row?.userId ?? null;
}
