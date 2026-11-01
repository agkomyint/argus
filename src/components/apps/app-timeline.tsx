"use client";

import { Bell, Film, Search, UserRound } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Consumer apps drawn on the timeline. Each app adds a lane of its own. A lane holds markers (one moment) or
 * spans (a stretch of time), all read from Observations the app wrote. Clicking one opens the app's panel with
 * why it fired. Shown in /design APP-02. Nothing here calls a model.
 */

export type TimelineItem = {
  id: string;
  /** Seconds from the start of the footage. */
  at: number;
  /** Set for a span; a marker has none. */
  to?: number;
  label: string;
  severity?: "low" | "high";
  /** The track this came from, so the panel can show its source and let a person name it. */
  track?: string;
  note?: string;
};

export type AppLane = { id: string; app: string; name: string; icon: "scene" | "person" | "alert" | "object"; reads: string[]; rule: string; items: TimelineItem[] };

const ICON = { scene: Film, person: UserRound, alert: Bell, object: Search } as const;
const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const label = "font-mono text-[10px] uppercase tracking-wider text-muted-foreground";

export function AppTimeline({ duration, lanes, start }: { duration: number; lanes: AppLane[]; start?: { selected?: string; names?: Record<string, string> } }) {
  const [selected, setSelected] = useState<string | null>(start?.selected ?? null);
  const [names, setNames] = useState<Record<string, string>>(start?.names ?? {});
  const all = lanes.flatMap((l) => l.items.map((i) => ({ lane: l, item: i })));
  const hit = all.find((x) => x.item.id === selected);
  const pct = (s: number) => `${Math.max(0, Math.min(100, (s / duration) * 100))}%`;
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round((duration / 4) * i));
  const nameOf = (i: TimelineItem) => (i.track && names[i.track]) || i.label;

  return (
    <section className="grid border lg:grid-cols-[1fr_16rem]">
      <div className="min-w-0 p-3">
        <div className="relative ml-28 h-5 border-b font-mono text-[10px] text-muted-foreground">
          {ticks.map((t) => <span key={t} className="absolute -translate-x-1/2" style={{ left: pct(t) }}>{clock(t)}</span>)}
        </div>
        {lanes.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No app is on this timeline yet. Add an app and its lane appears here.</p>}
        <ul className="grid gap-1.5 pt-2">
          {lanes.map((l) => {
            const Icon = ICON[l.icon];
            return (
              <li key={l.id} className="flex items-center gap-2">
                <span className="flex w-26 shrink-0 items-center gap-1.5 truncate text-xs" title={`${l.app} · ${l.name}`}><Icon className="size-3.5 shrink-0 text-electric" /><span className="truncate">{l.name}</span></span>
                <div className="relative h-8 flex-1 border bg-muted/30">
                  {l.items.length === 0 && <span className="absolute inset-0 flex items-center px-2 text-[11px] text-muted-foreground">nothing found</span>}
                  {l.items.map((i) => {
                    const on = selected === i.id;
                    const tone = i.severity === "high" ? "border-destructive bg-destructive/25" : "border-electric bg-electric/25";
                    return i.to === undefined ? (
                      <button key={i.id} type="button" aria-label={`${l.name}: ${nameOf(i)} at ${clock(i.at)}`} aria-pressed={on} onClick={() => setSelected(on ? null : i.id)} style={{ left: pct(i.at) }} className={cn("absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border", tone, on && "ring-2 ring-foreground")} />
                    ) : (
                      <button key={i.id} type="button" aria-label={`${l.name}: ${nameOf(i)} from ${clock(i.at)} to ${clock(i.to)}`} aria-pressed={on} onClick={() => setSelected(on ? null : i.id)} style={{ left: pct(i.at), width: `calc(${pct(i.to)} - ${pct(i.at)})` }} className={cn("absolute inset-y-1 min-w-2 overflow-hidden border px-1 text-left text-[10px] leading-6", tone, on && "ring-2 ring-foreground")}>{nameOf(i)}</button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <aside className="border-t p-3 lg:border-l lg:border-t-0" aria-label="App panel">
        {!hit ? (
          <p className="text-sm text-muted-foreground">Click a highlight to see which app made it and why.</p>
        ) : (
          <div className="grid gap-2 text-sm">
            <p className={label}>{hit.lane.app}</p>
            <p className="font-medium">{nameOf(hit.item)}</p>
            <p className="font-mono text-xs text-muted-foreground">{hit.item.to === undefined ? clock(hit.item.at) : `${clock(hit.item.at)} to ${clock(hit.item.to)} · ${Math.round(hit.item.to - hit.item.at)} s`}</p>
            {hit.item.note && <p className="text-xs text-muted-foreground">{hit.item.note}</p>}
            {hit.item.track && (
              <label className="grid gap-1">
                <span className={label}>Name this {hit.item.track}</span>
                <input value={names[hit.item.track] ?? ""} onChange={(e) => setNames({ ...names, [hit.item.track!]: e.target.value })} maxLength={40} placeholder="e.g. Maya" className="h-8 border bg-background px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                <span className="text-[11px] text-muted-foreground">SAM gives each person a number inside this clip, not a name. The name is yours and is kept for this clip only.</span>
              </label>
            )}
            <div className="border-t pt-2">
              <p className={label}>Why it fired</p>
              <p className="text-xs">Reads: {hit.lane.reads.join(", ")}</p>
              <p className="text-xs">Rule: {hit.lane.rule}</p>
              <p className="text-xs text-muted-foreground">Plain code, no model. Each step is in the Observatory.</p>
            </div>
          </div>
        )}
      </aside>
    </section>
  );
}
