"use client";

import { Loader2, Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { PanelProps } from "@/components/assistant/ask-panel";
import { cn } from "@/lib/utils";

// The chat (markdown, code highlighting, the AI SDK) is most of the page's JavaScript, so it loads on first
// hover or open, not with the studio. Hovering the button starts the download before the click.
const loadPanel = () => import("@/components/assistant/ask-panel");
const AskPanel = dynamic(() => loadPanel().then((m) => m.AskPanel), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center rounded-2xl border bg-card"><Loader2 className="size-5 animate-spin text-electric" /></div>,
});

/**
 * Ask ARGUS in the top bar: a button that opens the chat as a panel on the right.
 * ⌘J / Ctrl+J toggles it. The panel lives inside the page, so it still shows when presenting full screen.
 */
export function AskArgus({ projects, current, recorded, className }: Omit<PanelProps, "onClose" | "draft" | "failure">) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onPointerEnter={loadPanel}
        onFocus={loadPanel}
        aria-expanded={open}
        title="Ask ARGUS (⌘J)"
        className={cn(
          "group relative flex h-7 items-center gap-1.5 overflow-hidden rounded-full border border-electric/40 bg-electric/10 pl-2 pr-2.5 text-xs font-medium text-foreground transition-colors hover:bg-electric/20",
          open && "bg-electric/25",
          className,
        )}
      >
        <span aria-hidden className="pointer-events-none absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
        <Sparkles className="size-3.5 text-electric" />Ask ARGUS
        <kbd className="ml-0.5 hidden font-mono text-[10px] text-muted-foreground md:inline">⌘J</kbd>
      </button>
      {open && (
        <aside
          aria-label="Ask ARGUS"
          className="fixed inset-y-2 right-2 z-50 flex w-[min(26rem,calc(100vw-1rem))] flex-col transition-[translate,opacity] duration-300 ease-out starting:translate-x-8 starting:opacity-0"
        >
          <AskPanel projects={projects} current={current} recorded={recorded} onClose={() => setOpen(false)} className="h-full shadow-2xl shadow-black/40" />
        </aside>
      )}
    </>
  );
}

