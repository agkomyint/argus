"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { deleteChat } from "@/app/chat-actions";
import { cn } from "@/lib/utils";

export function ChatList({ chats }: { chats: { id: string; title: string }[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <nav aria-label="Chat history" className="flex flex-col gap-1 md:w-56 md:shrink-0 md:border-r md:pr-3">
      <Link href="/dashboard/assistant" className="mb-2 flex items-center gap-2 border px-3 py-2 text-sm hover:bg-accent/50">
        <Plus className="size-4" /> New chat
      </Link>
      <p className="px-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">History</p>
      <ul className="flex max-h-32 flex-col gap-0.5 overflow-y-auto md:max-h-none md:flex-1">
        {chats.length === 0 && <li className="px-1 py-2 text-xs text-muted-foreground">No chats yet.</li>}
        {chats.map((c) => {
          const href = `/dashboard/assistant/${c.id}`;
          return (
            <li key={c.id} className={cn("group flex items-center", pathname === href && "bg-accent")}>
              <Link href={href} className="min-w-0 flex-1 truncate px-2 py-1.5 text-sm">
                {c.title}
              </Link>
              <button
                type="button"
                aria-label={`Delete chat ${c.title}`}
                disabled={pending}
                className="px-2 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                onClick={() =>
                  start(async () => {
                    await deleteChat(c.id);
                    if (pathname === href) router.push("/dashboard/assistant");
                  })
                }
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
