import { desc, and, eq } from "drizzle-orm";
import { Suspense } from "react";
import { db } from "@/db";
import { chats } from "@/db/schema";
import { ChatList } from "@/components/dashboard/chat-list";
import { getWorkspace } from "@/lib/session";

export default function AssistantLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-6">
      <Suspense fallback={<div className="md:w-56" />}>
        <History />
      </Suspense>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

async function History() {
  const ws = (await getWorkspace())!;
  const rows = await db
    .select({ id: chats.id, title: chats.title })
    .from(chats)
    .where(and(eq(chats.userId, ws.user.id), eq(chats.projectId, ws.project.id)))
    .orderBy(desc(chats.updatedAt))
    .limit(50);
  return <ChatList chats={rows} />;
}
