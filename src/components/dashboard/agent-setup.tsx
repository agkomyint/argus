"use client";

import { useState, useTransition } from "react";
import { setAgentSetup } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { AGENT_LEVELS, VOLUMES, money } from "@/lib/agent-levels";
import { cn } from "@/lib/utils";

/** Pick a cost/accuracy level and a monthly volume. Figures are planning estimates, not measurements. */
export function AgentSetup({ level: saved, volume: savedVolume }: { level: number; volume: number }) {
  const [level, setLevel] = useState(saved);
  const [volume, setVolume] = useState(savedVolume);
  const [pending, start] = useTransition();
  const l = AGENT_LEVELS[level];
  const dirty = level !== saved || volume !== savedVolume;

  return (
    <div className="border">
      <ol className="grid gap-px bg-border sm:grid-cols-5">
        {AGENT_LEVELS.map((a, i) => (
          <li key={a.name} className="bg-background">
            <button type="button" onClick={() => setLevel(i)} aria-pressed={i === level} className={cn("flex h-full w-full flex-col p-4 text-left hover:bg-accent/40", i === level && "bg-accent/60 outline outline-2 -outline-offset-2 outline-electric")}>
              <span className="font-medium">{a.name}</span>
              <span className="mt-1 text-xs text-muted-foreground">{a.summary}</span>
              <span className="mt-3 font-mono text-[11px] text-muted-foreground">{money(a.costPer100)} / 100 photos</span>
              <span className="font-mono text-[11px] text-muted-foreground">~{a.accuracy}% accuracy</span>
              <span className="font-mono text-[11px] text-muted-foreground">~{a.seconds}s per photo</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t p-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Photos per month</span>
          {VOLUMES.map((v) => (
            <button key={v} type="button" onClick={() => setVolume(v)} aria-pressed={v === volume} className={cn("border px-2.5 py-1 font-mono text-xs", v === volume ? "border-electric text-electric" : "text-muted-foreground hover:text-foreground")}>{v.toLocaleString()}</button>
          ))}
        </div>
        <p className="font-mono text-sm">Estimated {money((l.costPer100 * volume) / 100)} / month</p>
        <Button className="ml-auto" disabled={!dirty || pending} onClick={() => start(() => setAgentSetup(level, volume))}>{pending ? "Saving…" : dirty ? "Save setup" : "Saved"}</Button>
      </div>
      <p className="border-t p-4 text-xs text-muted-foreground">
        Safety rails at every level: the model never sets severity, every claim is checked against the facts, and a person approves or dismisses each alert. Higher levels allow more claims, a longer brief and a stricter claim check. Cost, accuracy and speed are estimates for planning.
      </p>
    </div>
  );
}
