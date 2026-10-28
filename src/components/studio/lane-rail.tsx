"use client";

import { ChevronDown, FileUp, Loader2, Lock, Plus, Settings2, Video } from "lucide-react";
import { memo, useRef, useState } from "react";
import { ACCEPT, hasFiles, INPUT_ICON, Progress, useDrops, useSend, type LaneDrop, type StudioLane } from "@/components/studio/lane-drop";
import { openStudioWindow } from "@/components/studio/studio-window";
import { INPUT_LABEL } from "@/lib/setup-rules";
import type { ShareMedia } from "@/lib/share-types";
import type { TlItem, TlLane } from "@/lib/studio-timeline-types";
import { cn } from "@/lib/utils";

const label = "font-mono text-[10px] uppercase tracking-wider text-muted-foreground";
const THUMBS = 5;
const count = (n: number, one: string) => `${n.toLocaleString("en-US")} ${one}${n === 1 ? "" : "s"}`;

/**
 * The left of the studio: one card per lane, the only way anything comes in. Each card shows the lane's
 * newest pictures up to the playhead, how many of its files the AI has read, and which products it feeds.
 * In the owner's studio a files lane takes drops and a live lane opens its setup in place.
 */
export const LaneRail = memo(function LaneRail({ lanes, names, mediaOf, tq, selected, onSelect, owner, className }: {
  lanes: TlLane[]; names: Record<string, string>; mediaOf: (item: TlItem) => ShareMedia | null; tq: number;
  selected?: string | null; onSelect: (item: TlItem, lane: TlLane) => void;
  /** The owner's lanes (for drops and live state) and each live lane's setup, rendered on the server. */
  owner?: { lanes: StudioLane[]; setup?: Record<string, React.ReactNode>; preview?: { drops?: Record<string, LaneDrop>; over?: string } };
  className?: string;
}) {
  const live = useDrops();
  const drops = owner?.preview?.drops ?? live;
  return (
    <aside aria-label="Lanes" className={cn("flex min-h-0 flex-col bg-card", className)}>
      <div className="flex h-8 shrink-0 items-center justify-between border-b px-2">
        <span className={label}>Lanes</span>
        {owner ? (
          <button type="button" onClick={() => openStudioWindow("lanes")} className="flex items-center gap-1 text-[11px] text-electric hover:text-foreground"><Plus className="size-3" />Lane</button>
        ) : <span className="font-mono text-[9px] text-muted-foreground">read-only</span>}
      </div>
      <div className="min-h-0 flex-1 space-y-px overflow-y-auto bg-border [scrollbar-gutter:stable]">
        {lanes.length === 0 ? (
          <div className="grid h-full place-content-center gap-2 bg-card p-4 text-center text-[11px] text-muted-foreground">
            <p>{owner ? "Everything comes in through a lane. Make one first: files, a screen, a weather feed, a sensor or a webhook." : "No lanes in this project yet."}</p>
            {owner && <button type="button" onClick={() => openStudioWindow("lanes")} className="mx-auto flex items-center gap-1.5 bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/85"><Plus className="size-3.5" />Make a lane</button>}
          </div>
        ) : lanes.map((l) => (
          <LaneCard key={l.id} lane={l} names={names} mediaOf={mediaOf} tq={tq} selected={selected} onSelect={onSelect}
            own={owner?.lanes.find((o) => o.id === l.id)} setup={owner?.setup?.[l.id]} drop={drops[l.id]} over={owner?.preview ? owner.preview.over === l.id : undefined} />
        ))}
      </div>
    </aside>
  );
});

// Cards only redraw when their own lane, the playhead step or the picked file changes, so the rail does not
// rebuild while the replay plays.
const LaneCard = memo(function LaneCard({ lane, names, mediaOf, tq, selected, onSelect, own, setup, drop, over: forced }: {
  lane: TlLane; names: Record<string, string>; mediaOf: (item: TlItem) => ShareMedia | null; tq: number; selected?: string | null;
  onSelect: (item: TlItem, lane: TlLane) => void; own?: StudioLane; setup?: React.ReactNode; drop?: LaneDrop; over?: boolean;
}) {
  const go = useSend();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [open, setOpen] = useState(false);
  const Icon = INPUT_ICON[lane.input];
  const files = lane.input === "files";
  const droppable = files && !!own;
  const hot = forced ?? over;

  const seen = lane.items.filter((i) => i.t <= tq);
  const read = seen.filter((i) => i.state === "done" && i.done <= tq).length;
  const failed = seen.filter((i) => i.state === "failed" && i.done <= tq).length;
  const busy = seen.length - read - failed;
  const pics = seen.map((i) => ({ i, m: mediaOf(i) })).filter((x) => x.m || lane.locked).slice(-THUMBS).reverse();
  const last = seen.at(-1);
  const feeds = lane.feeds.map((id) => names[id]).filter(Boolean);

  return (
    <section
      aria-label={lane.name}
      onDragOver={droppable ? (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.stopPropagation(); setOver(true); } : undefined}
      onDragLeave={droppable ? () => setOver(false) : undefined}
      onDrop={droppable ? (e) => { e.preventDefault(); e.stopPropagation(); setOver(false); go(own, e.dataTransfer.files); } : undefined}
      className={cn("bg-card p-2 transition-colors", hot && "bg-electric/10 outline outline-1 -outline-offset-1 outline-electric", lane.items.some((i) => i.id === selected) && "border-l-2 border-electric")}
    >
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => last && onSelect(last, lane)} disabled={!last} className="flex min-w-0 flex-1 items-center gap-2 text-left" title={last ? "Show its newest item" : undefined}>
          <span className="grid size-6 shrink-0 place-items-center bg-muted text-muted-foreground"><Icon className="size-3.5" /></span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1 truncate text-xs font-medium">{lane.name}{lane.locked && <Lock className="size-2.5 shrink-0 text-muted-foreground" aria-label="Private" />}</span>
            <span className="block truncate font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{INPUT_LABEL[lane.input].name}</span>
          </span>
        </button>
        {droppable && (
          <>
            <button type="button" onClick={() => input.current?.click()} disabled={!!drop && !drop.error} aria-label={`Add files to ${lane.name}`} title="Add files" className="grid size-6 shrink-0 place-items-center text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"><FileUp className="size-3.5" /></button>
            <input ref={input} type="file" multiple hidden accept={ACCEPT[own.analyzer]} onChange={(e) => { go(own, e.target.files); e.target.value = ""; }} />
          </>
        )}
        {setup && (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`Set up ${lane.name}`} title="Set up" className="grid size-6 shrink-0 place-items-center text-muted-foreground hover:bg-accent hover:text-foreground">
            {open ? <ChevronDown className="size-3.5" /> : <Settings2 className="size-3.5" />}
          </button>
        )}
      </div>

      {files && (pics.length > 0 ? (
        <ul className="mt-2 grid grid-cols-5 gap-px">
          {pics.map(({ i, m }) => (
            <li key={i.id}>
              <button type="button" onClick={() => onSelect(i, lane)} title={`${i.label}`} aria-label={`Show ${i.label}`}
                className={cn("relative block aspect-square w-full overflow-hidden bg-muted", i.id === selected ? "outline outline-2 -outline-offset-2 outline-electric" : "hover:outline hover:outline-1 hover:-outline-offset-1 hover:outline-electric")}>
                {!m || lane.locked ? <Lock className="absolute inset-0 m-auto size-3 text-muted-foreground" />
                  : m.kind === "video" ? <Video className="absolute inset-0 m-auto size-3.5 text-muted-foreground" />
                    // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link
                    : <img src={m.src} alt="" decoding="async" className="size-full object-cover" />}
                {i.state === "failed" && <span className="absolute right-0 top-0 bg-destructive px-0.5 font-mono text-[8px] text-background">✕</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : hot ? null : droppable && !seen.length ? (
        <button type="button" onClick={() => input.current?.click()} className="mt-2 w-full border border-dashed px-2 py-3 text-center text-[11px] text-muted-foreground hover:border-electric hover:text-foreground">Drop files here</button>
      ) : null)}

      <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 font-mono text-[10px] text-muted-foreground">
        {hot ? <span className="text-electric">Let go to add</span> : files ? (
          <>
            {/* A video's sampled frames are counted apart from the files dropped in. */}
            <span>{count(seen.filter((i) => i.kind !== "frame").length, "file")}</span>
            {seen.some((i) => i.kind === "frame") && <span>· {count(seen.filter((i) => i.kind === "frame").length, "frame")}</span>}
            {seen.length > 0 && <span>· {read} read</span>}
            {busy > 0 && <span className="inline-flex items-center gap-0.5 text-electric">· <Loader2 className="size-2.5 animate-spin" />{busy}</span>}
            {failed > 0 && <span className="text-destructive">· {failed} ✕</span>}
          </>
        ) : own?.live && !own.live.ready ? <span className="text-electric">needs setup</span>
          : last ? <span>{count(lane.input === "screen" ? seen.length : seen.reduce((a, i) => a + i.rows.length, 0), lane.input === "screen" ? "frame" : "reading")} · last {new Date(last.t).toISOString().slice(11, 16)}</span>
            : <span>waiting for data</span>}
      </p>
      {feeds.length > 0 && <p className="mt-0.5 truncate text-[10px] text-muted-foreground" title={feeds.join(", ")}>→ {feeds.join(", ")}</p>}
      {drop && <div className="mt-1"><Progress d={drop} /></div>}
      {setup && open && <div className="mt-2 text-xs [&_section]:border-0 [&_section]:p-0">{setup}</div>}
    </section>
  );
});
