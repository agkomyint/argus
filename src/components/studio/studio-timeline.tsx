"use client";

import { ChevronDown, ChevronRight, ChevronsDown, ChevronsUp, Lock, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import "./studio-timeline.css";
import { ProductLane, type ProductSteps } from "@/components/explore/product-lane";
import { INPUT_ICON } from "@/components/studio/lane-drop";
import { SPEEDS, type ClockTime, type Speed } from "@/lib/replay-clock";
import type { StudioTimeline, TlItem, TlLane, TlStep } from "@/lib/studio-timeline-types";
import { cn } from "@/lib/utils";

/** Always UTC, so the server and the visitor's browser print the same thing. */
export const when = (t: number, day = true) =>
  new Date(t).toLocaleString("en-GB", { timeZone: "UTC", hour12: false, hour: "2-digit", minute: "2-digit", ...(day ? { day: "numeric", month: "short", second: "2-digit" } : {}) });

export type TimelineMode = "simple" | "steps" | "everything";
const MODES: [TimelineMode, string][] = [["simple", "Simple"], ["steps", "Lane steps"], ["everything", "Everything"]];
const KEY = "argus.timeline.mode";
const BINS = 220;
const ROW = 26;
const SUB = 18;
const MIN_H = 60;

// The viewer's mode, kept in this browser. It can be missing (private window, blocked storage); the default is used then.
const readMode = (): TimelineMode | null => {
  try {
    const v = localStorage.getItem(KEY);
    return v === "simple" || v === "steps" || v === "everything" ? v : null;
  } catch {
    return null;
  }
};
const listen = (f: () => void) => {
  window.addEventListener("storage", f);
  window.addEventListener(KEY, f);
  return () => { window.removeEventListener("storage", f); window.removeEventListener(KEY, f); };
};
function useMode(fallback: TimelineMode) {
  const stored = useSyncExternalStore(listen, readMode, () => null);
  const set = (m: TimelineMode) => {
    try { localStorage.setItem(KEY, m); } catch { /* kept for this visit only */ }
    window.dispatchEvent(new Event(KEY));
  };
  return [stored ?? fallback, set] as const;
}

/** What the timeline needs from the replay clock. */
export type TimelineClock = {
  time: ClockTime; tq: number; span: number; marks: number[]; playing: boolean; speed: Speed; skipQuiet: boolean;
  setSpeed: (s: Speed) => void; setSkipQuiet: (b: boolean) => void; play: () => void; jump: (d: 1 | -1) => void; seek: (t: number) => void;
};

/** Which products an item's rows went into, and how many rows each. */
export type Fed = { id: string; n: number; color: string }[];

/** For every item, the products its rows went into: a product row's id is the id of the Observation it came from. */
export function fedMap(products: { id: string; data: { rows: { id: string }[] }[] }[], steps: ProductSteps[], items: TlItem[]) {
  const owner = new Map<string, number>();
  products.forEach((p, i) => { for (const d of p.data) for (const r of d.rows) owner.set(r.id, i); });
  const out = new Map<string, Fed>();
  for (const item of items) {
    const n = new Map<number, number>();
    for (const r of item.rows) { const i = owner.get(r); if (i !== undefined) n.set(i, (n.get(i) ?? 0) + 1); }
    if (n.size) out.set(item.id, [...n].map(([i, k]) => ({ id: products[i].id, n: k, color: steps[i]?.color ?? "currentColor" })));
  }
  return out;
}

/**
 * The studio timeline: how each lane was read by the AI and what came out. Simple shows one row per lane
 * with a dot per file (hollow while it waits, filled once read, a cross if it failed) and a row of product
 * updates. Lane steps opens each lane into what went in, what the model read, what code checked and what came
 * out. Everything shows every recorded step by kind, and each product's line. Click a dot to follow that file.
 */
export function StudioTimelineView({ tl, start, end, clock, products, fedOf, selected, onSelect, activeProduct, onProduct, defaultMode = "simple", own, collapsed: startCollapsed = false, className }: {
  tl: StudioTimeline; start: number; end: number; clock: TimelineClock; products: ProductSteps[];
  fedOf: (item: string) => Fed; selected?: string | null; onSelect: (item: TlItem, lane: TlLane) => void;
  activeProduct?: string; onProduct: (id: string) => void; defaultMode?: TimelineMode;
  /** Keep the mode to this timeline instead of the viewer's saved one, as /design does to show each mode side by side. */
  own?: boolean; collapsed?: boolean; className?: string;
}) {
  const [saved, save] = useMode(defaultMode);
  const [local, setLocal] = useState(defaultMode);
  const [mode, setMode] = own ? [local, setLocal] : [saved, save];
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(startCollapsed);
  const [height, setHeight] = useState<number | null>(null);
  const { time, tq, span, playing, speed, skipQuiet, seek } = clock;
  const x = useCallback((at: number) => Math.min(100, Math.max(0, ((at - start) / (span || 1)) * 100)), [start, span]);
  const pick = selected ? tl.lanes.flatMap((lane) => lane.items.filter((item) => item.id === selected).map((item) => ({ lane, item })))[0] ?? null : null;
  const updated = useMemo(() => products.filter((p) => p.steps.length), [products]);
  const kinds = useMemo(() => {
    const all = [...tl.lanes.flatMap((l) => l.items.flatMap((i) => i.steps)), ...tl.other];
    return { model: all.filter((s) => s.kind === "model" && s.ok), code: all.filter((s) => s.kind === "code" && s.ok), tool: all.filter((s) => s.kind === "tool" && s.ok), failed: all.filter((s) => !s.ok) };
  }, [tl]);

  // Lane steps opens the lanes the AI worked on; a live lane with no recorded steps stays one row unless opened.
  const worked = useMemo(() => new Set(tl.lanes.filter((l) => l.items.some((i) => i.steps.length)).map((l) => l.id)), [tl]);
  const expanded = (id: string) => (mode === "steps" && worked.has(id) ? !open.has(id) : open.has(id));
  const toggle = useCallback((id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  const natural = mode === "everything"
    ? 4 * SUB + 4 + (updated.length ? Math.max(ROW, updated.length * 18 + 4) : 0)
    : tl.lanes.reduce((a, l) => a + ROW + (expanded(l.id) ? 4 * SUB : 0), 0) + (updated.length ? ROW : 0);
  const h = Math.max(MIN_H, height ?? Math.min(natural + 2, 320));

  const resize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const y0 = e.clientY, h0 = h;
    const move = (ev: PointerEvent) => setHeight(Math.min(window.innerHeight * 0.6, Math.max(MIN_H, h0 + y0 - ev.clientY)));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const seekAt = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    seek(start + ((e.clientX - r.left) / r.width) * span);
  }, [seek, start, span]);
  const empty = tl.lanes.length === 0;

  return (
    <section aria-label="Timeline" className={cn("relative shrink-0 border-t bg-card", className)}>
      {!collapsed && !empty && (
        <div role="separator" aria-orientation="horizontal" aria-label="Resize timeline" onPointerDown={resize} onDoubleClick={() => setHeight(null)} title="Drag to resize · double-click to reset"
          className="absolute inset-x-0 -top-1 z-10 hidden h-2 cursor-row-resize touch-none after:absolute after:inset-x-0 after:top-1 after:h-px hover:after:bg-electric @4xl:block" />
      )}
      <div className="flex h-9 items-center gap-2 px-2">
        <button type="button" className={tool} onClick={() => clock.jump(-1)} aria-label="Previous event" title="Previous event"><SkipBack className="size-3.5" /></button>
        <button type="button" onClick={clock.play} aria-label={playing ? "Pause" : "Play"} className="grid size-7 shrink-0 place-items-center bg-electric text-background hover:bg-electric/85">
          {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </button>
        <button type="button" className={tool} onClick={() => clock.jump(1)} aria-label="Next event" title="Next event"><SkipForward className="size-3.5" /></button>
        <Now time={time} />
        <div className="flex shrink-0 border" role="radiogroup" aria-label="How much to show">
          {MODES.map(([m, text]) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => { setMode(m); setOpen(new Set()); setCollapsed(false); }}
              className={cn("px-2 py-0.5 text-[11px]", mode === m && !collapsed ? "bg-electric/15 text-electric" : "text-muted-foreground hover:text-foreground")}>{text}</button>
          ))}
        </div>
        <span className="min-w-0 flex-1" />
        <label className="hidden items-center gap-1 font-mono text-[10px] text-muted-foreground @xl:flex" title="Jump over stretches where nothing ran">
          <input type="checkbox" checked={skipQuiet} onChange={(e) => clock.setSkipQuiet(e.target.checked)} className="accent-electric" />skip quiet
        </label>
        <select value={speed} onChange={(e) => clock.setSpeed(Number(e.target.value) as Speed)} aria-label="Speed" className="h-6 border bg-background px-1 font-mono text-[11px]">
          {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
        </select>
        <button type="button" className={tool} onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? "Show the timeline" : "Collapse the timeline"} title={collapsed ? "Show the timeline" : "Collapse to a strip"}>
          {collapsed ? <ChevronsUp className="size-3.5" /> : <ChevronsDown className="size-3.5" />}
        </button>
      </div>

      {/* The scrub strip lines up with the tracks below it. */}
      <div className="flex h-4 overflow-hidden border-t [scrollbar-gutter:stable]">
        <span className="w-44 shrink-0 border-r px-2 font-mono text-[9px] leading-4 text-muted-foreground">{when(start, false)} → {when(end, false)} UTC</span>
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
          {clock.marks.map((m) => <span key={m} className="absolute top-1 h-2 w-px bg-foreground/25" style={{ left: `${x(m)}%` }} />)}
          <Fill time={time} x={x} />
          <Scrub time={time} min={start} max={end} step={Math.max(1, span / 2000)} onSeek={seek} />
          <Playhead time={time} x={x} />
        </div>
      </div>

      {!collapsed && (empty ? (
        <p className="border-t px-3 py-4 text-center text-[11px] text-muted-foreground">Your lanes show here as soon as data comes in.</p>
      ) : (
        <div className="overflow-y-auto overflow-x-hidden border-t [scrollbar-gutter:stable]" style={{ height: h }}>
          <div className="relative min-h-full">
          {mode === "everything" ? (
            <>
              <KindRow title="AI model" steps={kinds.model} tone="bg-electric" shape="diamond" x={x} tq={tq} chain={pick?.item} onSeek={seek} />
              <KindRow title="Code" steps={kinds.code} tone="bg-signal" shape="square" x={x} tq={tq} chain={pick?.item} onSeek={seek} />
              <KindRow title="Tool" steps={kinds.tool} tone="bg-chart-4" shape="square" x={x} tq={tq} chain={pick?.item} onSeek={seek} />
              <KindRow title="Failed" steps={kinds.failed} tone="bg-destructive" shape="cross" x={x} tq={tq} chain={pick?.item} onSeek={seek} />
              {updated.length > 0 && <ProductLane products={products} start={start} span={span} t={tq} height={Math.max(ROW, updated.length * 18 + 4)} active={activeProduct} onSeek={seek} onSelect={onProduct} when={(v) => when(v)} />}
            </>
          ) : (
            <>
              {tl.lanes.map((l) => (
                <LaneRows key={l.id} lane={l} open={expanded(l.id)} canToggle onToggle={toggle} x={x} tq={tq}
                  selected={selected} onSelect={onSelect} fedOf={fedOf} onSeek={seekAt} />
              ))}
              {updated.length > 0 && <ProductMarks products={updated} x={x} tq={tq} active={activeProduct} chain={pick ? fedOf(pick.item.id) : null} chainAt={pick?.item.done} onProduct={onProduct} onSeek={seek} />}
            </>
          )}
          {/* The playhead, and the chain of the file being followed. The shade and the line both follow the smooth
              time, so they stay one edge; dots and counts follow the stepped time, which only changes a few times a second. */}
          <div className="pointer-events-none absolute inset-y-0 left-44 right-0 overflow-hidden">
            <Shade time={time} x={x} />
            {/* The picked file's chain: from when it came in to when the AI had read it. Picking it moves the playhead to
                the read end, so the preview and the steps show what the AI made of it. */}
            {pick && (
              <span className="absolute inset-y-0 border-x border-dashed border-electric/70 bg-electric/5" style={{ left: `${x(pick.item.t)}%`, width: `max(1px, ${x(pick.item.done) - x(pick.item.t)}%)` }}>
                <span className="absolute right-full top-0 mr-0.5 whitespace-nowrap bg-card px-0.5 font-mono text-[9px] leading-3 text-electric">came in {new Date(pick.item.t).toISOString().slice(11, 19)}</span>
                <span className="absolute left-full top-0 ml-1 whitespace-nowrap bg-card px-0.5 font-mono text-[9px] leading-3 text-electric">read {new Date(pick.item.done).toISOString().slice(11, 19)} ▸</span>
              </span>
            )}
            <Playhead time={time} x={x} thin />
          </div>
          </div>
        </div>
      ))}
    </section>
  );
}

const tool = "grid size-6 shrink-0 place-items-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

/**
 * Keeps one element in step with the playhead's exact time. The time changes every frame while playing, so it is
 * written to the element directly instead of rendering the timeline again; React only sees the stepped time.
 */
function useFollow<T extends HTMLElement>(time: ClockTime, apply: (el: T, t: number) => void) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const run = (t: number) => apply(el, t);
    run(time.get());
    return time.subscribe(run);
  }, [time, apply]);
  return ref;
}

type Follows = { time: ClockTime; x: (t: number) => number };

/**
 * The playhead line. It is a full-width box moved by transform, so playing only repaints it instead of laying the
 * timeline out again each frame; the line is pulled in by its own width so it stays visible at both ends.
 */
function Playhead({ time, x, thin }: Follows & { thin?: boolean }) {
  const w = thin ? 1 : 2;
  const ref = useFollow<HTMLSpanElement>(time, useCallback((el, t) => {
    const at = x(t);
    el.style.transform = `translateX(calc(${at}% - ${(at / 100) * w}px))`;
  }, [x, w]));
  return <span ref={ref} className={cn("pointer-events-none absolute inset-0 border-foreground will-change-transform", thin ? "border-l" : "border-l-2")} />;
}

/** What has not happened yet is shaded, from the playhead on. */
function Shade({ time, x }: Follows) {
  const ref = useFollow<HTMLSpanElement>(time, useCallback((el, t) => { el.style.transform = `translateX(${x(t)}%)`; }, [x]));
  return <span ref={ref} className="absolute inset-0 bg-card/55 will-change-transform" />;
}

/** The scrub strip fills up to the playhead. */
function Fill({ time, x }: Follows) {
  const ref = useFollow<HTMLSpanElement>(time, useCallback((el, t) => { el.style.transform = `scaleX(${x(t) / 100})`; }, [x]));
  return <span ref={ref} className="pointer-events-none absolute inset-0 origin-left bg-electric/10 will-change-transform" />;
}

/** The time at the playhead. */
function Now({ time }: { time: ClockTime }) {
  const ref = useFollow<HTMLSpanElement>(time, useCallback((el, t) => { const s = when(t); if (el.textContent !== s) el.textContent = s; }, []));
  return <span ref={ref} className="w-32 shrink-0 font-mono text-[11px] tabular-nums" />;
}

/** The seek control. Its value follows the playhead without React, and dragging it seeks. */
function Scrub({ time, min, max, step, onSeek }: { time: ClockTime; min: number; max: number; step: number; onSeek: (t: number) => void }) {
  const ref = useFollow<HTMLInputElement>(time, useCallback((el, t) => { el.value = String(t); }, []));
  return <input ref={ref} type="range" min={min} max={max} step={step} defaultValue={time.get()} onChange={(e) => onSeek(Number(e.target.value))} aria-label="Seek" className="absolute inset-0 w-full cursor-pointer opacity-0" />;
}

/** Items that land in the same slice of the strip become one dot, the newest of them, so a busy lane stays readable. */
function binned(items: TlItem[], x: (t: number) => number) {
  const slots = new Map<number, { item: TlItem; n: number }>();
  for (const i of items) {
    const k = Math.min(BINS - 1, Math.floor((x(i.t) / 100) * BINS));
    const s = slots.get(k);
    slots.set(k, { item: !s || i.t >= s.item.t ? i : s.item, n: (s?.n ?? 0) + 1 });
  }
  return [...slots.values()];
}

/** How an item looks at the playhead: not come in yet, waiting to be read, read, or failed. */
function look(i: TlItem, tq: number): "future" | "waiting" | "done" | "failed" {
  if (tq < i.t) return "future";
  if (tq < i.done || i.state === "waiting" || i.state === "reading") return "waiting";
  return i.state === "failed" ? "failed" : "done";
}

const LaneRows = memo(function LaneRows({ lane, open, canToggle, onToggle, x, tq, selected, onSelect, fedOf, onSeek }: {
  lane: TlLane; open: boolean; canToggle: boolean; onToggle: (id: string) => void; x: (t: number) => number; tq: number;
  selected?: string | null; onSelect: (i: TlItem, l: TlLane) => void; fedOf: (id: string) => Fed; onSeek: (e: React.MouseEvent<HTMLElement>) => void;
}) {
  const Icon = INPUT_ICON[lane.input];
  const bar = lane.input !== "files";
  const dots = useMemo(() => binned(lane.items, x), [lane.items, x]);
  const seen = lane.items.filter((i) => i.t <= tq);
  const read = seen.filter((i) => look(i, tq) === "done").length;
  const steps = lane.items.flatMap((i) => i.steps.map((s) => ({ s, i })));
  const outs = lane.items.flatMap((i) => fedOf(i.id).map((f) => ({ f, i })));
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <div className="border-b border-border/50">
      <div className="flex" style={{ height: ROW }}>
        <button type="button" onClick={() => onToggle(lane.id)} disabled={!canToggle} aria-expanded={open} title={canToggle ? (open ? "Close the lane's steps" : "Open the lane's steps") : undefined}
          className="flex w-44 shrink-0 items-center gap-1.5 border-r px-2 text-left text-[11px] hover:bg-accent/40 disabled:hover:bg-transparent">
          <Chevron className={cn("size-3 shrink-0 text-muted-foreground", !canToggle && "opacity-0")} />
          <Icon className="size-3 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{lane.name}</span>
          {lane.locked && <Lock className="size-2.5 shrink-0 text-muted-foreground" aria-label="Private" />}
          <span className="shrink-0 font-mono text-[9px] tabular-nums text-muted-foreground">{read}/{seen.length}</span>
        </button>
        <div className="relative min-w-0 flex-1 cursor-pointer" onClick={onSeek} role="presentation">
          <span className="absolute inset-x-0 top-1/2 h-px bg-border/70" />
          {dots.map(({ item, n }) => {
            const l = look(item, tq);
            const on = item.id === selected;
            return (
              <button key={item.id} type="button" onClick={(e) => { e.stopPropagation(); onSelect(item, lane); }}
                aria-label={`${item.label}, ${item.state}${n > 1 ? `, and ${n - 1} more here` : ""}`} title={`${item.label} · ${when(item.t)} UTC${n > 1 ? ` · ${n} here` : ""}`}
                className={cn("absolute top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center", bar ? "h-3.5 w-1.5" : "size-3", on && "z-10 outline outline-2 outline-offset-2 outline-electric")}
                style={{ left: `${x(item.t)}%` }}>
                <Mark look={l} bar={bar} big={n > 1} />
              </button>
            );
          })}
        </div>
      </div>
      {open && (
        <div className="bg-background/40">
          <SubRow title="in" hint="what came into the lane">
            {dots.map(({ item }) => <Tick key={item.id} left={x(item.t)} cls={cn("h-2 w-px", item.t <= tq ? "bg-foreground/70" : "bg-foreground/20")} dim={!!selected && item.id !== selected} />)}
          </SubRow>
          <SubRow title="◆ AI read" hint="a model looked at it">
            {steps.filter(({ s }) => s.kind !== "code").map(({ s, i }) => <Tick key={s.id} left={x(s.t)} title={`${s.name}${s.model ? ` · ${s.model}` : ""} · ${s.ms} ms`} cls={cn("size-2 rotate-45", !s.ok ? "bg-destructive" : s.t <= tq ? "bg-electric" : "bg-electric/25")} dim={!!selected && i.id !== selected} />)}
          </SubRow>
          <SubRow title="■ checked" hint="code checked the answer and kept rows">
            {steps.filter(({ s }) => s.kind === "code").map(({ s, i }) => <Tick key={s.id} left={x(s.t)} title={`${s.name} · kept ${s.wrote}`} cls={cn("size-1.5", !s.ok ? "bg-destructive" : s.t <= tq ? "bg-signal" : "bg-signal/25")} dim={!!selected && i.id !== selected} />)}
          </SubRow>
          <SubRow title="▲ out" hint="rows went into a data product">
            {outs.map(({ f, i }) => <Tick key={`${i.id}-${f.id}`} left={x(i.done)} title={`+${f.n}`} cls="tl-tri" color={i.done <= tq ? f.color : `color-mix(in oklab, ${f.color} 30%, transparent)`} dim={!!selected && i.id !== selected} />)}
          </SubRow>
        </div>
      )}
    </div>
  );
});

function Mark({ look: l, bar, big }: { look: ReturnType<typeof look>; bar: boolean; big: boolean }) {
  if (l === "failed") return <span className="font-mono text-[11px] font-bold leading-none text-destructive">✕</span>;
  const size = bar ? "h-3.5 w-1" : big ? "size-2.5" : "size-2";
  if (l === "done") return <span className={cn(size, "bg-electric", !bar && "rounded-full")} />;
  if (l === "waiting") return <span className={cn(size, "border border-electric", !bar && "rounded-full")} />;
  return <span className={cn(size, "border border-muted-foreground/40", !bar && "rounded-full")} />;
}

function SubRow({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex border-t border-border/30" style={{ height: SUB }}>
      <span className="flex w-44 shrink-0 items-center border-r pl-9 font-mono text-[9px] text-muted-foreground" title={hint}>{title}</span>
      <div className="relative min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Tick({ left, cls, title, color, dim }: { left: number; cls: string; title?: string; color?: string; dim?: boolean }) {
  return <span title={title} className={cn("absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-opacity", cls, dim && "opacity-25")} style={{ left: `${left}%`, ...(color ? { color } : {}) }} />;
}

const KindRow = memo(function KindRow({ title, steps, tone, shape, x, tq, chain, onSeek }: {
  title: string; steps: TlStep[]; tone: string; shape: "diamond" | "square" | "cross"; x: (t: number) => number; tq: number; chain?: TlItem; onSeek: (t: number) => void;
}) {
  const mine = new Set(chain?.steps.map((s) => s.id));
  return (
    <div className="flex border-b border-border/50" style={{ height: SUB + 1 }}>
      <span className="flex w-44 shrink-0 items-center justify-between border-r px-2 text-[11px]">{title}<span className="font-mono text-[9px] text-muted-foreground">{steps.filter((s) => s.t <= tq).length}</span></span>
      <div className="relative min-w-0 flex-1">
        {steps.map((s) => (
          <button key={s.id} type="button" onClick={() => onSeek(s.t)} title={`${s.name}${s.model ? ` · ${s.model}` : ""} · ${s.ms} ms${s.error ? ` · ${s.error}` : ""}`}
            className={cn("absolute top-1/2 -translate-x-1/2 -translate-y-1/2", shape === "cross" ? "font-mono text-[10px] leading-none text-destructive" : cn(tone, shape === "diamond" ? "size-2 rotate-45" : "size-1.5"), s.t > tq && "opacity-25", chain && !mine.has(s.id) && "opacity-20")}
            style={{ left: `${x(s.t)}%` }}>{shape === "cross" ? "✕" : null}</button>
        ))}
      </div>
    </div>
  );
});

/** The row of product updates in Simple: a triangle each time a product got rows, in its colour. */
const ProductMarks = memo(function ProductMarks({ products, x, tq, active, chain, chainAt, onProduct, onSeek }: {
  products: ProductSteps[]; x: (t: number) => number; tq: number; active?: string; chain: Fed | null; chainAt?: number; onProduct: (id: string) => void; onSeek: (t: number) => void;
}) {
  return (
    <div className="flex" style={{ height: ROW }}>
      <span className="flex w-44 shrink-0 items-center gap-1.5 border-r px-2 text-[11px]">▤ Products<span className="ml-auto font-mono text-[9px] text-muted-foreground">{products.length}</span></span>
      <div className="relative min-w-0 flex-1">
        {products.flatMap((p) => p.steps.map((s) => (
          <button key={`${p.id}-${s.at}`} type="button" onClick={() => { onSeek(s.at); onProduct(p.id); }} title={`${p.name} · +${s.n} · ${when(s.at)} UTC`} aria-label={`${p.name} got ${s.n} rows`}
            className={cn("tl-tri absolute top-1/2 -translate-x-1/2 -translate-y-1/2", s.at > tq && "opacity-25", active && active !== p.id && "opacity-50")}
            style={{ left: `${x(s.at)}%`, color: p.color }} />
        )))}
        {chain && chainAt !== undefined && chain.map((f, k) => (
          <span key={f.id} className="pointer-events-none absolute -translate-x-1/2 bg-background px-1 font-mono text-[9px]" style={{ left: `${x(chainAt)}%`, top: 1 + k * 11, color: f.color }}>+{f.n}</span>
        ))}
      </div>
    </div>
  );
});
