"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export type TimelineItem = { id: string; t: number; label: string; detail: string };
export type TimelineTrack = { id: string; name: string; items: TimelineItem[] };

const COLORS = ["bg-electric", "bg-signal", "bg-foreground", "bg-muted-foreground"];
const fmt = (t: number) => new Date(t).toISOString().slice(0, 16).replace("T", " ") + "Z";

/** Every source on one shared time axis, like a video editor: one track per source, zoom the range, click a clip to look inside. */
export function SourceTimeline({ tracks }: { tracks: TimelineTrack[] }) {
  const all = useMemo(() => tracks.flatMap((t) => t.items.map((i) => i.t)), [tracks]);
  const min = all.length ? Math.min(...all) : 0;
  const max = all.length ? Math.max(...all) : 1;
  const span = Math.max(max - min, 1);
  const [zoom, setZoom] = useState(1); // 1 = whole range
  const [pan, setPan] = useState(0); // 0..1 of the free space
  const [picked, setPicked] = useState<{ track: string; item: TimelineItem } | null>(null);

  if (!all.length) return <p className="text-sm text-muted-foreground">Nothing on the timeline yet. Anything you connect or upload shows up here, on its own track, by when it happened.</p>;

  const win = span / zoom;
  const start = min + (span - win) * pan;
  const pos = (t: number) => ((t - start) / win) * 100;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <label className="flex items-center gap-2">Zoom
          <input type="range" min={1} max={50} step={0.5} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="accent-[var(--electric)]" />
        </label>
        <label className="flex items-center gap-2">Scroll
          <input type="range" min={0} max={1} step={0.01} value={pan} disabled={zoom === 1} onChange={(e) => setPan(Number(e.target.value))} className="accent-[var(--electric)]" />
        </label>
        <span className="ml-auto font-mono">{fmt(start)} → {fmt(start + win)}</span>
      </div>

      <div className="mt-3 border">
        {tracks.map((tr, ti) => (
          <div key={tr.id} className="grid grid-cols-[7rem_1fr] border-b last:border-b-0">
            <div className="flex items-center border-r px-3 py-3 text-xs font-medium">
              <span className="truncate">{tr.name}</span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">{tr.items.length}</span>
            </div>
            <div className="relative h-11 overflow-hidden bg-muted/30">
              {tr.items.map((it) => {
                const x = pos(it.t);
                if (x < -1 || x > 101) return null;
                const on = picked?.item.id === it.id;
                return (
                  <button
                    key={it.id}
                    type="button"
                    title={`${it.label} · ${fmt(it.t)}`}
                    onClick={() => setPicked({ track: tr.name, item: it })}
                    style={{ left: `${x}%` }}
                    className={cn("absolute top-2 h-7 w-1.5 -translate-x-1/2 hover:opacity-70", COLORS[ti % COLORS.length], on && "outline outline-2 outline-offset-1 outline-foreground")}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 border p-3 text-sm">
        {picked ? (
          <>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{picked.track} · {fmt(picked.item.t)}</p>
            <p className="mt-1 font-medium">{picked.item.label}</p>
            <pre className="mt-2 max-h-40 overflow-auto bg-muted p-2 text-[11px]">{picked.item.detail}</pre>
          </>
        ) : (
          <p className="text-muted-foreground">Click a clip to look inside. Zoom to separate clips that are close together.</p>
        )}
      </div>
    </div>
  );
}
