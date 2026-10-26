import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { UIMessage } from "ai";
import { Suspense } from "react";
import { z } from "zod";
import { db } from "@/db";
import { chats } from "@/db/schema";
import { Assistant } from "@/components/dashboard/assistant";
import { getWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Assistant — ARGUS" };

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div aria-busy="true" className="h-96 animate-pulse bg-muted" />}>
      <Chat params={params} />
    </Suspense>
  );
}

async function Chat({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = (await getWorkspace())!;
  if (!z.uuid().safeParse(id).success) notFound();
  const [chat] = await db.select().from(chats).where(and(eq(chats.id, id), eq(chats.userId, ws.user.id)));
  if (!chat) notFound();
  return <Assistant key={chat.id} chatId={chat.id} initialMessages={chat.messages as UIMessage[]} projectName={ws.project.name} />;
}
