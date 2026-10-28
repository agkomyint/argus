"use server";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { chats } from "@/db/schema";
import type { AskMessage } from "@/lib/assistant";
import { getAccount } from "@/lib/session";

export type ChatSummary = { id: string; title: string; updatedAt: string };

/** The signed-in user's recent Ask ARGUS chats, newest first. */
export async function listChats(): Promise<ChatSummary[]> {
  const account = await getAccount();
  if (!account) return [];
  const rows = await db.select({ id: chats.id, title: chats.title, updatedAt: chats.updatedAt }).from(chats).where(eq(chats.userId, account.user.id)).orderBy(desc(chats.updatedAt)).limit(20);
  return rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updatedAt.toISOString() }));
}

/** One chat's messages, exactly as they were streamed. Null when it is not the user's. */
export async function loadChat(id: string): Promise<AskMessage[] | null> {
  const account = await getAccount();
  if (!account) return null;
  const [row] = await db.select({ messages: chats.messages }).from(chats).where(and(eq(chats.id, id), eq(chats.userId, account.user.id)));
  return row ? (row.messages as AskMessage[]) : null;
}

export async function deleteChat(id: string) {
  const account = await getAccount();
  if (!account) return;
  await db.delete(chats).where(and(eq(chats.id, id), eq(chats.userId, account.user.id)));
}
