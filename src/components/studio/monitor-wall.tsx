"use client";

import { ChevronLeft, ChevronRight, LayoutGrid, Lock, Radio, Rows3, Search } from "lucide-react";
import { useState } from "react";
import { INPUT_ICON } from "@/components/studio/lane-drop";
import { filterMonitors, neighbour, pageHolding, pageOf, type Monitor } from "@/lib/monitors";
import type { ShareMedia } from "@/lib/share-types";
import { cn } from "@/lib/utils";

/**
 * Monitors: one small screen per lane showing what that lane has at the playhead. One is in focus (it fills the
 * Preview above); the rest are a click away. Any number of lanes work: the strip and the wall show a page at a
 * time, a filter narrows by name or kind, and the arrow keys walk the list. Shown in /design PRV-01.
 */

const label = "font-mono text-[10px] uppercase tracking-wider text-muted-foreground";
export const STRIP = 6;
export const WALL = 12;

const picture = (m: ShareMedia | null) => (m && m.kind !== "video" && m.kind !== "audio" ? m.src : null);

function Tile({ m, focused, onFocus }: { m: Monitor<ShareMedia>; focused: boolean; onFocus: (id: string) => void }) {
  const Icon = INPUT_ICON[m.lane.input];
  const src = picture(m.media);
  return (
    <li className="min-w-0">
      <button type="button" onClick={() => onFocus(m.lane.id)} aria-pressed={focused} aria-label={`${m.lane.name}: ${m.state === "live" ? m.item?.label : m.state === "locked" ? "private" : "nothing yet"}`}
        className={cn("group relative block aspect-video w-full overflow-hidden border bg-black/60 text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring", focused ? "border-electric ring-1 ring-electric" : "hover:border-foreground/40")}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link; next/image would cache it
          <img src={src} alt="" className="size-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <span className="grid size-full place-items-center text-muted-foreground">
            {m.state === "locked" ? <Lock className="size-4" /> : <Icon className="size-4" />}
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-background/85 px-1.5 py-0.5">
          <span className={cn("size-1.5 shrink-0 rounded-full", m.state === "live" ? "bg-signal" : "bg-muted-foreground/40")} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-[10px] font-medium">{m.lane.name}</span>
          <span className="shrink-0 font-mono text-[9px] text-muted-foreground">{m.seen}</span>
        </span>
        {m.state !== "live" && <span className="absolute left-1 top-1 bg-background/80 px-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{m.state === "locked" ? "private" : "nothing yet"}</span>}
      </button>
    </li>
  );
}

export function MonitorWall({ monitors, focus, auto, onFocus, onAuto, className }: {
  monitors: Monitor<ShareMedia>[];
  /** The lane in focus, which the Preview shows. */
  focus: string | null;
  /** True while the focus follows whichever lane changed last. */
  auto: boolean;
  onFocus: (laneId: string) => void;
  /** Hands the focus back to the newest lane. */
  onAuto: () => void;
  className?: string;
}) {
  const [wall, setWall] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const size = wall ? WALL : STRIP;
  const shown = filterMonitors(monitors, q);
  const ids = shown.map((m) => m.lane.id);
  const view = pageOf(shown, page, size);
  // The focused lane's tile stays on screen: when the focus moves (the timeline, an alert, the arrow keys) the page follows it.
  const holding = pageHolding(ids, focus, size);
  const [seen, setSeen] = useState(focus);
  if (seen !== focus) { setSeen(focus); if (focus && ids.includes(focus)) setPage(holding); }

  const go = (step: 1 | -1) => { const next = neighbour(ids, focus, step); if (next) onFocus(next); };
  if (monitors.length < 2) return null;

  return (
    <section aria-label="Lane monitors" className={cn("flex min-h-0 flex-col border-t bg-card", className)}
      onKeyDown={(e) => {
        if (e.target instanceof HTMLInputElement) return;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); go(1); }
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); go(-1); }
        else if (e.key === "PageDown") { e.preventDefault(); setPage(view.page + 1); }
        else if (e.key === "PageUp") { e.preventDefault(); setPage(view.page - 1); }
      }}>
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b px-2">
        <span className={cn(label, "shrink-0")}>Monitors · {monitors.length} lanes</span>
        <label className="ml-auto flex min-w-0 max-w-40 flex-1 items-center gap-1 border bg-background px-1.5">
          <Search className="size-3 shrink-0 text-muted-foreground" aria-hidden />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Find a lane" aria-label="Find a lane" className="h-6 min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground" />
        </label>
        <button type="button" onClick={onAuto} aria-pressed={auto} title="Follow the lane that changed last"
          className={cn("flex h-6 items-center gap-1 border px-1.5 text-[10px]", auto ? "border-electric bg-electric/10 text-electric" : "hover:bg-muted")}><Radio className="size-3" />Auto</button>
        <button type="button" onClick={() => { setWall(!wall); setPage(0); }} aria-pressed={wall} title={wall ? "Back to the strip" : "Show every lane as a wall"}
          className="flex h-6 items-center gap-1 border px-1.5 text-[10px] hover:bg-muted">{wall ? <Rows3 className="size-3" /> : <LayoutGrid className="size-3" />}{wall ? "Strip" : "Wall"}</button>
      </div>

      {shown.length === 0 ? (
        <p className="p-3 text-center text-[11px] text-muted-foreground">No lane matches &quot;{q}&quot;.</p>
      ) : (
        <div className="flex min-h-0 items-stretch gap-1 overflow-y-auto p-1.5">
          <button type="button" onClick={() => setPage(view.page - 1)} disabled={view.page === 0} aria-label="Previous lanes" className="grid w-5 shrink-0 place-items-center border hover:bg-muted disabled:opacity-30"><ChevronLeft className="size-3" /></button>
          <ul className={cn("grid min-w-0 flex-1 gap-1.5", wall ? "grid-cols-2 @lg:grid-cols-3 @3xl:grid-cols-4" : "grid-cols-3 @lg:grid-cols-6")}>
            {view.items.map((m) => <Tile key={m.lane.id} m={m} focused={m.lane.id === focus} onFocus={onFocus} />)}
          </ul>
          <button type="button" onClick={() => setPage(view.page + 1)} disabled={view.page >= view.pages - 1} aria-label="Next lanes" className="grid w-5 shrink-0 place-items-center border hover:bg-muted disabled:opacity-30"><ChevronRight className="size-3" /></button>
        </div>
      )}
      <p className="flex shrink-0 items-center justify-between border-t px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
        <span>page {view.page + 1} of {view.pages}{q && ` · ${shown.length} match`}</span>
        <span className="hidden @lg:inline">← → change lane · PageUp/PageDown change page</span>
      </p>
    </section>
  );
}
