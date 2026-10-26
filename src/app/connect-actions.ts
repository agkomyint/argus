"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { oauthAccessToken, oauthConsent, oauthRefreshToken } from "@/db/schema";
import { createApiKey, revokeApiKey } from "@/lib/api-keys";
import { getAccount } from "@/lib/session";

async function userId() {
  const account = await getAccount();
  if (!account) throw new Error("Sign in first");
  return account.user.id;
}

/** Make a personal key. The key itself is returned once and never stored. */
export async function makeApiKey(name: string) {
  const { key } = await createApiKey(await userId(), name);
  revalidatePath("/dashboard/connect");
  return key;
}

export async function deleteApiKey(id: string) {
  await revokeApiKey(await userId(), id);
  revalidatePath("/dashboard/connect");
}

/** Cut an OAuth-connected agent off: its tokens stop working and it has to ask again. */
export async function disconnectAgent(clientId: string) {
  const uid = await userId();
  const mine = (t: typeof oauthAccessToken | typeof oauthRefreshToken | typeof oauthConsent) => and(eq(t.clientId, clientId), eq(t.userId, uid));
  await db.delete(oauthAccessToken).where(mine(oauthAccessToken));
  await db.delete(oauthRefreshToken).where(mine(oauthRefreshToken));
  await db.delete(oauthConsent).where(mine(oauthConsent));
  revalidatePath("/dashboard/connect");
}
