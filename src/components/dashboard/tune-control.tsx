"use client";

import { ArrowRight } from "lucide-react";
import { useState, useTransition } from "react";
import { setTune } from "@/app/engine-actions";
import { Button } from "@/components/ui/button";
import { AGENT_LEVELS, money } from "@/lib/agent-levels";
import { estimate, FREQUENCIES, frequencyIndex } from "@/lib/tune";
import { cn } from "@/lib/utils";

const label = "font-mono text-[10px] uppercase tracking-wider text-muted-foreground";

function Dial({ name, options, at, onPick }: { name: string; options: string[]; at: number; onPick: (i: number) => void }) {
  return (
    <div role="radiogroup" aria-label={name}>
      <p className={cn(label, "mb-1.5")}>{name}</p>
      <div className="flex border">
        {options.map((o, i) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={i === at}
            onClick={() => onPick(i)}
            className={cn("flex-1 border-r px-2 py-2 text-center text-xs last:border-r-0", i === at ? "bg-electric font-medium text-background" : "text-muted-foreground hover:bg-accent/40 hover:text-foreground")}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The two dials: how careful the agents are, and how often they look. Cheaper means less accurate and
 * less often; better costs more. The estimate moves as the dials do; Save applies it to the engine.
 */
export function TuneControl({ level: savedLevel, frequency: savedSeconds }: { level: number; frequency: number }) {
  const [level, setLevel] = useState(savedLevel);
  const [freq, setFreq] = useState(frequencyIndex(savedSeconds));
  const [pending, start] = useTransition();
  const seconds = FREQUENCIES[freq].seconds;
  const now = estimate(level, seconds);
  const dirty = level !== savedLevel || seconds !== savedSeconds;
  const ends = [
    { tag: "Cheapest", set: `Lean · ${FREQUENCIES.at(-1)!.label.toLowerCase()}`, e: estimate(0, FREQUENCIES.at(-1)!.seconds) },
    { tag: "Your setting", set: `${AGENT_LEVELS[level].name} · ${FREQUENCIES[freq].label.toLowerCase()}`, e: now, you: true },
    { tag: "Best", set: `Maximum · ${FREQUENCIES[0].label.toLowerCase()}`, e: estimate(AGENT_LEVELS.length - 1, FREQUENCIES[0].seconds) },
  ];

  return (
    <div className="border">
      <div className="grid gap-6 p-4 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-4">
          <Dial name="How careful (accuracy)" options={AGENT_LEVELS.map((a) => a.name)} at={level} onPick={setLevel} />
          <Dial name="How often it looks (live sources)" options={FREQUENCIES.map((f) => f.label)} at={freq} onPick={setFreq} />
          <p className="text-xs text-muted-foreground">Left costs less but is less accurate or sees less. Right costs more and gives better data. {AGENT_LEVELS[level].summary}.</p>
        </div>
        <dl className="divide-y border">
          {([
            ["Live cost", `${money(now.cost)} / hour`],
            ["Files", `${money(AGENT_LEVELS[level].costPer100)} / 100 photos`],
            ["Accuracy", `~${now.accuracy}%`],
            ["Looks", `${Math.round(now.perHour)} frames / hour`],
          ] as const).map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-2 p-2.5"><dt className="text-sm text-muted-foreground">{k}</dt><dd className="font-mono text-sm tabular-nums">{v}</dd></div>
          ))}
        </dl>
      </div>
      <ul className="grid gap-px border-t bg-border sm:grid-cols-3">
        {ends.map((r) => (
          <li key={r.tag} className={cn("bg-background p-3", r.you && "outline outline-2 -outline-offset-2 outline-electric")}>
            <p className={label}>{r.tag}</p>
            <p className="mt-1 text-sm">{r.set}</p>
            <p className="mt-2 flex items-center gap-2 font-mono text-xs tabular-nums text-muted-foreground">{money(r.e.cost)}/h <ArrowRight className="size-3" /> ~{r.e.accuracy}%</p>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-3">
        <p className="text-xs text-muted-foreground">Estimates for planning, not measurements. Applies to new work; what is already queued keeps its setting.</p>
        <Button size="sm" disabled={!dirty || pending} onClick={() => start(() => setTune(level, seconds))}>{pending ? "Saving…" : dirty ? "Apply" : "Applied"}</Button>
      </div>
    </div>
  );
}
