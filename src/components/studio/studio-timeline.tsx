"use client";

import { ChevronDown, ChevronRight, ChevronsDown, ChevronsUp, Lock, Maximize, Pause, Play, SkipBack, SkipForward, ZoomIn, ZoomOut } from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import "./studio-timeline.css";
import type { AppAlert } from "@/lib/app-run";
import { ProductLane, type ProductSteps } from "@/components/explore/product-lane";
import { gapLength, quietGaps, shrunkAxis, type Axis, type QuietGap } from "@/lib/quiet-gaps";
import { MIN_VIEW, rulerTicks, type View } from "@/lib/timeline-zoom";
import { SPEEDS, type ClockTime, type Speed } from "@/lib/replay-clock";
import type { StudioTimeline, TlItem, TlLane, TlStep } from "@/lib/studio-timeline-types";
import { cn } from "@/lib/utils";

/** Always UTC, so the server and the visitor's browser print the same thing. */
// One formatter each, made once: building a new one per call was the biggest cost while playing (every dot's title, every frame).
const WITH_DAY = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", hour12: false, hour: "2-digit", minute: "2-digit", day: "numeric", month: "short", second: "2-digit" });
const CLOCK_ONLY = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", hour12: false, hour: "2-digit", minute: "2-digit" });
export const when = (t: number, day = true) => (day ? WITH_DAY : CLOCK_ONLY).format(t);

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
export function StudioTimelineView({ tl, start, end, clock, products, alerts: allAlerts = NO_ALERTS, onAlert, fedOf, selected, onSelect, activeProduct, onProduct, defaultMode = "simple", defaultView, own, frames, collapsed: startCollapsed = false, className }: {
  tl: StudioTimeline; start: number; end: number; clock: TimelineClock; products: ProductSteps[];
  /** Alerts from the consumer apps, drawn as one row of marks; a click moves the playhead there. */
  alerts?: AppAlert[];
  /** A click on an alert mark; without it the playhead just moves there. */
  onAlert?: (a: AppAlert) => void;
  fedOf: (item: string) => Fed; selected?: string | null; onSelect: (item: TlItem, lane: TlLane) => void;
  activeProduct?: string; onProduct: (id: string) => void; defaultMode?: TimelineMode;
  /** Skip processing: the timeline zooms to the video frames, and each file is one dot with no read span. Offered when the project has video frames. */
  frames?: { on: boolean; set: (on: boolean) => void; range: View | null };
  /** Start zoomed in on this part of the replay (the viewer can change it). */
  defaultView?: View;
  /** Keep the mode to this timeline instead of the viewer's saved one, as /design does to show each mode side by side. */
  own?: boolean; collapsed?: boolean; className?: string;
}) {
  const [saved, save] = useMode(defaultMode);
  const [local, setLocal] = useState(defaultMode);
  const [mode, setMode] = own ? [local, setLocal] : [saved, save];
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(startCollapsed);
  const [height, setHeight] = useState<number | null>(null);
  // The part of the replay on screen, in real time; null shows all of it.
  const [view, setView] = useState<View | null>(defaultView ?? null);
  // True once the viewer has moved the window themselves; the window then stays put instead of following the playhead.
  const [held, setHeld] = useState(false);
  // Turning Skip processing on zooms to the frames; turning it off shows the whole replay again.
  const [zoomedFor, setZoomedFor] = useState(false);
  if (zoomedFor !== !!frames?.on) { setZoomedFor(!!frames?.on); setView(frames?.on ? frames.range : null); setHeld(!!frames?.on); }
  const root = useRef<HTMLElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const { time, tq: now, span, playing, speed, skipQuiet, seek } = clock;
  const pick = selected ? tl.lanes.flatMap((lane) => lane.items.filter((item) => item.id === selected).map((item) => ({ lane, item })))[0] ?? null : null;
  const merged = !!frames?.on;
  // Merged, an alert moves onto the frame it came from instead of its own row.
  const alerts = merged ? NO_ALERTS : allAlerts;
  const flagged = useMemo(() => {
    const m = new Map<string, AppAlert[]>();
    if (merged) for (const l of tl.lanes) for (const i of l.items) { const a = allAlerts.filter((x) => i.rows.includes(x.rowId)); if (a.length) m.set(i.id, a); }
    return m;
  }, [merged, allAlerts, tl.lanes]);
  const updated = useMemo(() => (merged ? [] : products.filter((p) => p.steps.length)), [products, merged]);
  const kinds = useMemo(() => {
    const all = [...tl.lanes.flatMap((l) => l.items.flatMap((i) => i.steps)), ...tl.other];
    return { model: all.filter((s) => s.kind === "model" && s.ok), code: all.filter((s) => s.kind === "code" && s.ok), tool: all.filter((s) => s.kind === "tool" && s.ok), failed: all.filter((s) => !s.ok) };
  }, [tl]);

  // Lane steps opens the lanes the AI worked on; a live lane with no recorded steps stays one row unless opened.
  const worked = useMemo(() => new Set(tl.lanes.filter((l) => l.items.some((i) => i.steps.length)).map((l) => l.id)), [tl]);
  const expanded = (id: string) => (mode === "steps" && worked.has(id) ? !open.has(id) : open.has(id));
  const toggle = useCallback((id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  const natural = mode === "everything"
    ? 4 * SUB + 4 + (updated.length ? Math.max(ROW, updated.length * 18 + 4) : 0) + (alerts.length ? ROW : 0)
    : tl.lanes.reduce((a, l) => a + ROW + (expanded(l.id) ? 4 * SUB : 0), 0) + (updated.length ? ROW : 0) + (alerts.length ? ROW : 0);
  const h = Math.max(MIN_H, height ?? Math.min(natural + 2, 320));

  const resize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const y0 = e.clientY, h0 = h;
    const move = (ev: PointerEvent) => setHeight(Math.min(window.innerHeight * 0.6, Math.max(MIN_H, h0 + y0 - ev.clientY)));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const empty = tl.lanes.length === 0;
  // The rows only change how they look at the moments something happens (a file lands, a step starts or ends, a product
  // gets rows, a quiet stretch begins or ends). So they get the latest of those moments at or before the playhead instead
  // of the playhead's every step: crossing a quiet stretch changes nothing, so nothing is drawn again.
  const moments = useMemo(() => {
    const t: number[] = [...clock.marks];
    for (const l of tl.lanes) for (const i of l.items) { t.push(i.t, i.done); for (const st of i.steps) t.push(st.t, st.t + st.ms); }
    for (const st of tl.other) t.push(st.t, st.t + st.ms);
    for (const p of products) for (const st of p.steps) t.push(st.at);
    return t.sort((a, b) => a - b);
  }, [tl, clock.marks, products]);
  // Quiet stretches in the middle: where no file came in and nothing was being read. Plain code over the items; no model.
  const gaps = useMemo(() => {
    // Real activity only: a file landing, a file's read finishing, each recorded step while it ran, and the replay's own marks.
    // The wait between a file coming in and its read is not activity, so it does not close a gap.
    const pad = Math.max(span / 160, 4_000);
    const spans: (readonly [number, number])[] = clock.marks.map((m) => [m, m] as const);
    for (const l of tl.lanes) for (const i of l.items) {
      spans.push([i.t, i.t], [i.done, i.done]);
      for (const s of i.steps) spans.push([s.t, s.t + s.ms]);
    }
    for (const s of tl.other) spans.push([s.t, s.t + s.ms]);
    return quietGaps(spans, pad, Math.max(span / 60, 20_000), 4_000);
  }, [tl, clock.marks, span]);
  // Quiet stretches are drawn narrow so the busy parts get the room. Everything's product graph is drawn on a straight axis, so it keeps one.
  const tq = useMemo(() => {
    const m = [...gaps.flatMap((g) => [g.from, g.to]), ...moments].sort((a, b) => a - b);
    return (n: number) => { let lo2 = 0, hi2 = m.length; while (lo2 < hi2) { const mid = (lo2 + hi2) >> 1; if (m[mid] <= n) lo2 = mid + 1; else hi2 = mid; } return lo2 ? m[lo2 - 1] : start - 1; };
  }, [gaps, moments, start])(now);
  const shrink = mode !== "everything" && gaps.length > 0;
  const from = view?.from ?? start, to = view?.to ?? end;
  // The whole replay is laid out once with quiet stretches squeezed small; the window is a slice of that picture, so they stay small at any zoom.
  const whole = useMemo(() => shrunkAxis(start, end, shrink ? gaps : []), [start, end, gaps, shrink]);
  const lo = whole.x(from), hi = whole.x(to);
  const axis = useMemo(() => {
    const k = 100 / (hi - lo || 1);
    return { x: (t: number) => (whole.x(t) - lo) * k, at: (pct: number) => whole.at(lo + Math.min(100, Math.max(0, pct)) / k) };
  }, [whole, lo, hi]);
  // Zoomed in, the axis runs past 0 and 100 so marks off screen can be told apart; zoomed out, everything is kept on the strip.
  const x = useMemo(() => (view ? axis.x : (t: number) => Math.min(100, Math.max(0, axis.x(t)))), [view, axis]);
  // Dots are grouped by fixed slices of the picture while zoomed, so panning does not shuffle them between groups.
  // The slice size only changes in whole steps of zoom (powers of two), so panning slowly never nudges a dot into the next slice.
  const slice = view ? 2 ** Math.round(Math.log2(Math.max(hi - lo, 0.001) / BINS)) : 0;
  const bin = useMemo(() => (slice ? (t: number) => Math.floor(whole.x(t) / slice) : undefined), [whole, slice]);
  // While playing, the window follows the playhead page by page (like Premiere's Page Scroll): when the playhead nears
  // the right edge, the window glides one page ahead over a fraction of a second, instead of jumping.
  const glide = useRef<{ frame: number; on: boolean }>({ frame: 0, on: false });
  useEffect(() => () => { cancelAnimationFrame(glide.current.frame); glide.current.on = false; }, []);
  useEffect(() => {
    const g = glide.current;
    if (!playing || !view || held) { cancelAnimationFrame(g.frame); g.on = false; return; }
    if (g.on) return; // already gliding; the new view each frame must not restart it
    const w = hi - lo, at = whole.x(now);
    if (at >= lo && at <= hi - w * 0.05) return;
    const target = Math.min(100 - w, Math.max(0, at - w * 0.15));
    const t0 = performance.now(), from0 = lo, DUR = 260;
    g.on = true;
    const run = (now: number) => {
      const k = Math.min(1, (now - t0) / DUR), e = 1 - (1 - k) ** 3;
      const a0 = from0 + (target - from0) * e;
      setView({ from: whole.at(a0), to: whole.at(a0 + w) });
      if (k < 1) g.frame = requestAnimationFrame(run); else g.on = false;
    };
    g.frame = requestAnimationFrame(run);
  }, [now, playing, held, view, whole, lo, hi]);
  const ticks = useMemo(() => rulerTicks({ from, to }, shrink ? gaps : []), [from, to, gaps, shrink]);
  const seekAt = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    seek(axis.at(((e.clientX - r.left) / r.width) * 100));
  }, [seek, axis]);

  // Zoom keeps the time under `anchor` (the playhead by default) where it is; null means everything again.
  const zoom = useCallback((factor: number) => {
    setHeld(false);
    setView((v) => {
      const a0 = v ? whole.x(v.from) : 0, b0 = v ? whole.x(v.to) : 100;
      const at = whole.x(Math.min(v?.to ?? end, Math.max(v?.from ?? start, time.get())));
      const keep = Math.min(1, Math.max(0, (at - a0) / (b0 - a0 || 1)));
      const width = Math.min(100, Math.max(Math.max(whole.x(start + MIN_VIEW) - whole.x(start), 0.01), (b0 - a0) * factor));
      if (width >= 99.9) return null;
      const left = Math.min(100 - width, Math.max(0, at - keep * width));
      return { from: whole.at(left), to: whole.at(left + width) };
    });
  }, [start, end, time, whole]);
  // Two fingers sliding sideways (or Shift + wheel) move the zoomed window. The listener is set once and reads the latest view from a ref.
  const latest = useRef({ view, whole });
  useEffect(() => { latest.current = { view, whole }; });
  const push = useRef({ by: 0, frame: 0 });
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const on = (e: WheelEvent) => {
      const { view: v, whole: ax } = latest.current;
      const w = stripRef.current?.getBoundingClientRect().width;
      if (!v || !w || e.ctrlKey || e.metaKey) return;
      const d = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      if (!d || (!e.shiftKey && Math.abs(e.deltaX) * 2 <= Math.abs(e.deltaY))) return;
      e.preventDefault();
      setHeld(true);
      // Momentum scrolling sends a burst of tiny moves. They are added up and drawn once per screen frame.
      const q = push.current;
      // A slow slide follows the fingers one to one; a fast flick is boosted (up to 4x) so it can cross a long replay like the bar does.
      const boost = 1 + Math.min(Math.abs(d), 90) / 30;
      q.by += ((d * boost) / w) * (ax.x(v.to) - ax.x(v.from));
      if (!q.frame) q.frame = requestAnimationFrame(() => {
        q.frame = 0;
        const cur = latest.current;
        if (cur.view) setView(slideView(cur.view, cur.whole, q.by));
        q.by = 0;
      });
    };
    el.addEventListener("wheel", on, { passive: false });
    const q = push.current;
    return () => { el.removeEventListener("wheel", on); cancelAnimationFrame(q.frame); q.frame = 0; };
  }, []);
  // + zooms in, - zooms out, 0 shows everything; only while the pointer is over the timeline and not typing.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || t?.closest("input, textarea, select, [contenteditable]") || !root.current?.matches(":hover")) return;
      if (e.key === "+" || e.key === "=") zoom(0.625);
      else if (e.key === "-" || e.key === "_") zoom(1.6);
      else if (e.key === "0") setView(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [zoom]);
  return (
    <section ref={root} aria-label="Timeline" className={cn("relative shrink-0 overscroll-x-contain border-t bg-card", className)}>
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
        {frames && (
          <label className="hidden items-center gap-1 font-mono text-[10px] text-muted-foreground @xl:flex" title="Show only each frame and the product updates, without the processing steps">
            <input type="checkbox" checked={frames.on} onChange={(e) => frames.set(e.target.checked)} className="accent-electric" />skip processing
          </label>
        )}
        <label className="hidden items-center gap-1 font-mono text-[10px] text-muted-foreground @xl:flex" title="Jump over stretches where nothing ran">
          <input type="checkbox" checked={skipQuiet} onChange={(e) => clock.setSkipQuiet(e.target.checked)} className="accent-electric" />skip quiet
        </label>
        <div className="flex shrink-0" role="group" aria-label="Zoom the time scale">
          <button type="button" className={tool} onClick={() => zoom(1.6)} disabled={!view} aria-label="Zoom out" title="Zoom out (-)"><ZoomOut className="size-3.5" /></button>
          <button type="button" className={tool} onClick={() => zoom(0.625)} aria-label="Zoom in" title="Zoom in on the playhead (+)"><ZoomIn className="size-3.5" /></button>
          <button type="button" className={tool} onClick={() => setView(null)} disabled={!view} aria-label="Show everything" title="Show the whole replay (0)"><Maximize className="size-3.5" /></button>
        </div>
        <select value={speed} onChange={(e) => clock.setSpeed(Number(e.target.value) as Speed)} aria-label="Speed" className="h-6 border bg-background px-1 font-mono text-[11px]">
          {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
        </select>
        <button type="button" className={tool} onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? "Show the timeline" : "Collapse the timeline"} title={collapsed ? "Show the timeline" : "Collapse to a strip"}>
          {collapsed ? <ChevronsUp className="size-3.5" /> : <ChevronsDown className="size-3.5" />}
        </button>
      </div>

      {/* The scrub strip lines up with the tracks below it. It is also the ruler: round times, left out inside quiet breaks. */}
      <div className="flex h-6 overflow-hidden border-t [scrollbar-gutter:stable]">
        <span className="w-44 shrink-0 border-r px-2 font-mono text-[9px] leading-6 text-muted-foreground">{when(from, false)} → {when(to, false)} UTC{view ? " · zoomed" : ""}</span>
        <div ref={stripRef} className="relative min-w-0 flex-1 overflow-hidden">
          {ticks.map(({ t, step }) => (
            <span key={t} className="pointer-events-none absolute inset-y-0 border-l border-border pl-0.5 font-mono text-[9px] leading-3 text-muted-foreground" style={{ left: `${x(t)}%` }}>
              {new Date(t).toISOString().slice(11, step < 60_000 ? 19 : 16)}
            </span>
          ))}
          <div className="absolute inset-x-0 bottom-1 h-px bg-border" />
          {clock.marks.map((m) => <span key={m} className="absolute bottom-0 h-2 w-px bg-foreground/25" style={{ left: `${x(m)}%` }} />)}
          <Fill time={time} x={x} />
          <Scrub time={time} x={x} at={axis.at} onSeek={seek} />
          <Playhead time={time} x={x} />
          {gaps.map((g) => <GapChip key={g.from} gap={g} x={x} tq={tq} onSeek={seek} />)}
        </div>
      </div>
      {view && <Overview view={view} whole={whole} onChange={(v) => { setHeld(true); setView(v); }} />}

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
              {updated.length > 0 && <ProductLane products={products} start={from} span={to - from} t={tq} height={Math.max(ROW, updated.length * 18 + 4)} active={activeProduct} onSeek={seek} onSelect={onProduct} when={(v) => when(v)} />}
              {alerts.length > 0 && <AlertMarks alerts={alerts} x={x} tq={tq} onOpen={onAlert ?? ((a) => seek(a.at))} />}
            </>
          ) : (
            <>
              {tl.lanes.map((l) => (
                <LaneRows key={l.id} lane={l} bin={bin} open={expanded(l.id)} canToggle onToggle={toggle} x={x} tq={tq}
                  selected={selected} onSelect={onSelect} fedOf={fedOf} onSeek={seekAt} merged={merged} flagged={flagged} />
              ))}
              {updated.length > 0 && <ProductMarks products={updated} x={x} tq={tq} active={activeProduct} chain={pick ? fedOf(pick.item.id) : null} chainAt={pick?.item.done} onProduct={onProduct} onSeek={seek} />}
              {alerts.length > 0 && <AlertMarks alerts={alerts} x={x} tq={tq} onOpen={onAlert ?? ((a) => seek(a.at))} />}
            </>
          )}
          {/* The playhead, and the chain of the file being followed. The shade and the line both follow the smooth
              time, so they stay one edge; dots and counts follow the stepped time, which only changes a few times a second. */}
          <div className="pointer-events-none absolute inset-y-0 left-44 right-0 overflow-hidden">
            {gaps.map((g) => <span key={g.from} className="tl-quiet absolute inset-y-0" style={{ left: `${x(g.from)}%`, width: `${x(g.to) - x(g.from)}%` }} />)}
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

/**
 * A small box over a quiet stretch in the middle: "No activity" and how long. It stays on the strip whether the
 * playhead is before, inside or after it, and a click moves the playhead to where activity resumes. Clicking again
 * from there goes back to the start of the quiet stretch, so it can be looked at again.
 */
function GapChip({ gap, x, tq, onSeek }: { gap: QuietGap; x: (t: number) => number; tq: number; onSeek: (t: number) => void }) {
  // Zoomed in, the gap can run past either edge; the box covers only the part on screen, so its words stay in view.
  const left = Math.max(0, x(gap.from)), width = Math.min(100, x(gap.to)) - left;
  if (width <= 0) return null;
  const inside = tq >= gap.from && tq < gap.to;
  const past = tq >= gap.to;
  const len = gapLength(gap.to - gap.from);
  const text = `No activity ${when(gap.from, false)}–${when(gap.to, false)} UTC (${len})`;
  return (
    <button type="button" onClick={() => onSeek(past ? gap.from : gap.to)} aria-label={text}
      title={`${text}. Click to ${past ? "go back to the start of it" : "skip to where activity resumes"}`}
      className={cn("absolute inset-y-0 z-10 flex items-center justify-center overflow-hidden whitespace-nowrap border-x border-dashed px-0.5 font-mono text-[9px] leading-none",
        inside ? "border-chart-4 bg-chart-4/60 text-foreground" : "border-chart-4/70 bg-chart-4/30 text-foreground hover:bg-chart-4/50")}
      style={{ left: `${left}%`, width: `${width}%` }}>
      {width > 12 ? `No activity · ${len}` : width > 5 ? len : "⋯"}
    </button>
  );
}

/** Move a window along the drawn picture by `by` (a percent of the whole), keeping its drawn width and stopping at the ends. */
function slideView(v: View, whole: Axis, by: number): View {
  const a = whole.x(v.from), b = whole.x(v.to);
  const s = Math.min(100 - b, Math.max(-a, by));
  return { from: whole.at(a + s), to: whole.at(b + s) };
}

/**
 * Where the window sits in the whole replay, shown only when zoomed in. It is drawn like the strip (quiet stretches small). Drag the lit part to pan; click elsewhere to move the window there.
 */
function Overview({ view, whole, onChange }: { view: View; whole: Axis; onChange: (v: View) => void }) {
  const a0 = whole.x(view.from), b0 = whole.x(view.to);
  const drag = (e: React.PointerEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    const el = e.currentTarget;
    const w = el.parentElement?.getBoundingClientRect().width;
    if (!w) return;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX, base = view;
    const go = (ev: PointerEvent) => onChange(slideView(base, whole, ((ev.clientX - x0) / w) * 100));
    const stop = () => { el.removeEventListener("pointermove", go); el.removeEventListener("pointerup", stop); el.removeEventListener("pointercancel", stop); };
    el.addEventListener("pointermove", go);
    el.addEventListener("pointerup", stop);
    el.addEventListener("pointercancel", stop);
  };
  return (
    <div className="flex h-3.5 overflow-hidden border-t [scrollbar-gutter:stable]">
      <span className="w-44 shrink-0 border-r" />
      <div className="relative min-w-0 flex-1 cursor-pointer bg-muted/40" role="presentation"
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onChange(slideView(view, whole, ((e.clientX - r.left) / r.width) * 100 - (a0 + b0) / 2)); }}>
        <span onPointerDown={drag} onClick={(e) => e.stopPropagation()} title="Drag to pan" className="absolute inset-y-0 cursor-grab touch-none rounded-sm bg-electric/50 hover:bg-electric/70 active:cursor-grabbing"
          style={{ left: `${a0}%`, width: `${b0 - a0}%` }} />
      </div>
    </div>
  );
}

/** What has not happened yet is shaded, from the playhead on. */
function Shade({ time, x }: Follows) {
  const ref = useFollow<HTMLSpanElement>(time, useCallback((el, t) => { el.style.transform = `translateX(${x(t)}%)`; }, [x]));
  return <span ref={ref} className="absolute inset-0 bg-card/55 will-change-transform" />;
}

/** The scrub strip fills up to the playhead. */
function Fill({ time, x }: Follows) {
  const ref = useFollow<HTMLSpanElement>(time, useCallback((el, t) => { el.style.transform = `scaleX(${Math.min(1, Math.max(0, x(t) / 100))})`; }, [x]));
  return <span ref={ref} className="pointer-events-none absolute inset-0 origin-left bg-electric/10 will-change-transform" />;
}

/** The time at the playhead. */
function Now({ time }: { time: ClockTime }) {
  const ref = useFollow<HTMLSpanElement>(time, useCallback((el, t) => { const s = when(t); if (el.textContent !== s) el.textContent = s; }, []));
  return <span ref={ref} className="w-32 shrink-0 font-mono text-[11px] tabular-nums" />;
}

/** The seek control. Its value follows the playhead without React, and dragging it seeks. */
function Scrub({ time, x, at, onSeek }: Follows & { at: (pct: number) => number; onSeek: (t: number) => void }) {
  const ref = useFollow<HTMLInputElement>(time, useCallback((el, t) => { el.value = String(x(t)); }, [x]));
  return <input ref={ref} type="range" min={0} max={100} step={0.05} defaultValue={x(time.get())} onChange={(e) => onSeek(at(Number(e.target.value)))} aria-label="Seek" className="absolute inset-0 w-full cursor-pointer opacity-0" />;
}

/** Items that land in the same slice of the strip become one dot, the newest of them, so a busy lane stays readable. */
function binned(items: TlItem[], x: (t: number) => number, bin?: (t: number) => number) {
  const slots = new Map<number, { item: TlItem; n: number }>();
  for (const i of items) {
    const at = x(i.t);
    if (at < 0 || at > 100) continue; // zoomed in and off screen
    const k = bin ? bin(i.t) : Math.min(BINS - 1, Math.floor((x(i.t) / 100) * BINS));
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

const LaneRows = memo(function LaneRows({ lane, bin, open, canToggle, onToggle, x, tq, selected, onSelect, fedOf, onSeek, merged, flagged }: {
  merged?: boolean; flagged?: Map<string, AppAlert[]>; lane: TlLane; bin?: (t: number) => number; open: boolean; canToggle: boolean; onToggle: (id: string) => void; x: (t: number) => number; tq: number;
  selected?: string | null; onSelect: (i: TlItem, l: TlLane) => void; fedOf: (id: string) => Fed; onSeek: (e: React.MouseEvent<HTMLElement>) => void;
}) {
  const bar = lane.input !== "files";
  const dots = useMemo(() => binned(lane.items, x, bin), [lane.items, x, bin]);
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
          <span className="min-w-0 flex-1 truncate">{lane.name}</span>
          {lane.locked && <Lock className="size-2.5 shrink-0 text-muted-foreground" aria-label="Private" />}
          <span className="shrink-0 font-mono text-[9px] tabular-nums text-muted-foreground">{read}/{seen.length}</span>
        </button>
        <div className="relative min-w-0 flex-1 cursor-pointer overflow-hidden" onClick={onSeek} role="presentation">
          <span className="absolute inset-x-0 top-1/2 h-px bg-border/70" />
          {dots.map(({ item, n }) => {
            const l = look(item, tq);
            const on = item.id === selected;
            return (
              <button key={item.id} type="button" onClick={(e) => { e.stopPropagation(); onSelect(item, lane); }}
                aria-label={`${item.label}, ${item.state}${n > 1 ? `, and ${n - 1} more here` : ""}`} title={`${item.label} · ${when(item.t)} UTC${n > 1 ? ` · ${n} here` : ""}`}
                className={cn("absolute top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center", bar ? "h-3.5 w-1.5" : "size-3", on && "z-10 outline outline-2 outline-offset-2 outline-electric")}
                style={{ left: `${x(item.t)}%` }}>
                <Mark look={l} bar={bar} big={n > 1} alt={merged} />
                {merged && item.done <= tq && <Total fed={fedOf(item.id)} alerts={flagged?.get(item.id)} />}
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

function Total({ fed, alerts }: { fed: Fed; alerts?: AppAlert[] }) {
  const n = fed.reduce((a, f) => a + f.n, 0);
  if (!n && !alerts?.length) return null;
  const high = alerts?.some((a) => a.severity === "high");
  return (
    <span className="pointer-events-none absolute left-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 font-mono text-[9px] leading-none text-muted-foreground" title={[...fed.map((f) => `+${f.n}`), ...(alerts ?? []).map((a) => `◆ ${a.appName}: ${a.label}`)].join(" · ")}>
      {!!alerts?.length && <span className={cn("size-2 rotate-45 border", high ? "border-destructive bg-destructive/50" : "border-electric bg-electric/40")} />}
      {fed.slice(0, 3).map((f) => <span key={f.id} className="size-1.5 rounded-full" style={{ background: f.color }} />)}+{n}
    </span>
  );
}

function Mark({ look: l, bar, big, alt }: { look: ReturnType<typeof look>; bar: boolean; big: boolean; alt?: boolean }) {
  if (l === "failed") return <span className="font-mono text-[11px] font-bold leading-none text-destructive">✕</span>;
  const size = bar ? "h-3.5 w-1" : big ? "size-2.5" : "size-2";
  if (l === "done") return <span className={cn(size, alt ? "bg-signal" : "bg-electric", !bar && "rounded-full")} />;
  if (l === "waiting") return <span className={cn(size, "border", alt ? "border-signal" : "border-electric", !bar && "rounded-full")} />;
  return <span className={cn(size, "border border-muted-foreground/40", !bar && "rounded-full")} />;
}

function SubRow({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex border-t border-border/30" style={{ height: SUB }}>
      <span className="flex w-44 shrink-0 items-center border-r pl-9 font-mono text-[9px] text-muted-foreground" title={hint}>{title}</span>
      <div className="relative min-w-0 flex-1 overflow-hidden">{children}</div>
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
      <div className="relative min-w-0 flex-1 overflow-hidden">
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
      <div className="relative min-w-0 flex-1 overflow-hidden">
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

const NO_ALERTS: AppAlert[] = [];

/** The row of app alerts: a diamond each time an app fired, red when it was high. Ones the playhead has not reached yet are faint. */
const AlertMarks = memo(function AlertMarks({ alerts, x, tq, onOpen }: { alerts: AppAlert[]; x: (t: number) => number; tq: number; onOpen: (a: AppAlert) => void }) {
  return (
    <div className="flex" style={{ height: ROW }}>
      <span className="flex w-44 shrink-0 items-center gap-1.5 border-r px-2 text-[11px]">◆ Alerts<span className="ml-auto font-mono text-[9px] text-muted-foreground">{alerts.length}</span></span>
      <div className="relative min-w-0 flex-1 overflow-hidden">
        {alerts.map((a) => (
          <button key={a.id} type="button" onClick={() => onOpen(a)} title={`${a.appName} · ${a.label}${a.frameMs !== null ? ` · frame at ${Math.floor(a.frameMs / 60000)}:${String(Math.floor(a.frameMs / 1000) % 60).padStart(2, "0")}` : ""} · ${when(a.at)} UTC`} aria-label={`Alert: ${a.appName}, ${a.label}`}
            className={cn("absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border", a.severity === "high" ? "border-destructive bg-destructive/50" : "border-electric bg-electric/40", a.at > tq && "opacity-30")}
            style={{ left: `${x(a.at)}%` }} />
        ))}
      </div>
    </div>
  );
});
