"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { chats } from "@/db/schema";
import { getWorkspace } from "@/lib/session";

export async function deleteChat(id: string) {
  const ws = await getWorkspace();
  if (!ws) return;
  await db.delete(chats).where(and(eq(chats.id, id), eq(chats.userId, ws.user.id)));
  revalidatePath("/dashboard/assistant", "layout");
}
