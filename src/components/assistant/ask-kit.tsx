"use client";

import { AskArgus } from "@/components/assistant/ask-argus";
import { AskPanel } from "@/components/assistant/ask-panel";
import { ASK_PROJECTS, ASK_RECORDED } from "@/components/assistant/ask-samples";

/** AI-01 variants, each in a fixed-height box so the panel's own scrolling shows. */
export function AskKit() {
  const box = "h-[34rem]";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4 border bg-card px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Top-bar button · click it (⌘J)</p>
        <AskArgus projects={ASK_PROJECTS} current="deck-a" recorded={ASK_RECORDED} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Variant label="New chat, opened from a project slide"><AskPanel projects={ASK_PROJECTS} current="deck-a" className={box} /></Variant>
        <Variant label="New chat, all projects in scope"><AskPanel projects={ASK_PROJECTS} className={box} /></Variant>
        <Variant label="Typing @ shows the project menu"><AskPanel projects={ASK_PROJECTS} draft="Compare @b" className={box} /></Variant>
        <Variant label="An answer with what was looked up (recorded)"><AskPanel projects={ASK_PROJECTS} recorded={ASK_RECORDED} className={box} /></Variant>
        <Variant label="AI not connected on the server"><AskPanel projects={ASK_PROJECTS} failure="The AI is not connected on this server yet. Add META_API_KEY and try again." className={box} /></Variant>
        <Variant label="No projects yet"><AskPanel projects={[]} className={box} /></Variant>
      </div>
    </div>
  );
}

function Variant({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
