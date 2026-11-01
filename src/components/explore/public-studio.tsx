"use client";

import { ArrowRight, ChevronLeft, ChevronRight, Eye, Film, FolderOpen, Play } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { productSteps } from "@/components/explore/product-lane";
import { Logo } from "@/components/landing/logo";
import { StudioDropZone, type LaneDrop, type StudioLane } from "@/components/studio/lane-drop";
import { AlertNotifier, DeliveryPanel } from "@/components/studio/delivery-panel";
import { LaneRail } from "@/components/studio/lane-rail";
// Monitor wall switched off for now; the component is kept. Re-enable it together with the JSX below.
// import { MonitorWall } from "@/components/studio/monitor-wall";
import { MaskOverlay, placed } from "@/components/studio/mask-overlay";
import { LaneStory, ScenePreview, useMiddle, type MiddleLayout, type PanelSize, type Recent } from "@/components/studio/lane-story";
import { ProductRail, useRailWidth } from "@/components/studio/product-rail";
import { fedMap, StudioTimelineView, when, type Fed, type TimelineMode } from "@/components/studio/studio-timeline";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { MediaProvider } from "@/widgets/media";
import { alertsOf, type AppAlert, type AppConfig } from "@/lib/app-run";
import type { Dataset } from "@/lib/product-types";
import type { ReplayData } from "@/lib/replay";
import { latestLane, monitorsAt } from "@/lib/monitors";
import { useReplayClock } from "@/lib/replay-clock";
import type { ShareMedia, ShareView } from "@/lib/share-types";
import { EMPTY_TIMELINE, type StudioTimeline, type TlItem, type TlLane } from "@/lib/studio-timeline-types";
import { cn } from "@/lib/utils";

export type PublicProject = { slug: string; name: string; kind: string; owner: string; createdAt: number; sharedAt: number };
export type PublicProduct = { id: string; name: string; summary: string; data: Dataset[] };

const label = "font-mono text-[10px] uppercase tracking-wider text-muted-foreground";
const NONE: Fed = [];
/** How many of the newest steps "At the playhead" lists. The panel is short and scrolls. */
const RECENT_MAX = 500;

/** A replay with nothing in it, for a project that was shared before anything ran. */
const blank = (p: PublicProject): ReplayData => ({ start: p.createdAt, end: Math.max(p.sharedAt, p.createdAt + 60_000), nodes: [], edges: [], born: {}, jobs: [], arrivals: {}, feeds: {}, events: [] });

/**
 * ARGUS Studio. Left, the lanes everything comes in through; middle, the picture the AI looked at and how it
 * read it, step by step; right, the data products it fed; along the bottom, the timeline of every file going
 * from lane to product. The owner sees their own project live; anyone with a share link sees the same studio as
 * a read-only replay. Everything here is recorded; watching it calls no model.
 */
export function PublicStudio({ project, replay, products, view, timeline, apps, start, autoplay, owner, mode, middle, className }: {
  project: PublicProject; replay: ReplayData | null; products: PublicProduct[]; view: ShareView; timeline?: StudioTimeline;
  /** The project's consumer apps. Their alerts are worked out here from the products' rows, so a shared replay shows the same ones. */
  apps?: AppConfig[]; start?: number; autoplay?: boolean;
  /** The owner's own studio: their menu and windows in the top bar, drops and setup on the lanes, CSV from the owner route, and the playhead follows new data. */
  owner?: { bar: React.ReactNode; /** Files stopped part way, shown as a strip above the timeline. */ attention?: React.ReactNode; exportBase: string; lanes?: StudioLane[]; laneSetup?: Record<string, React.ReactNode>; preview?: { drops?: Record<string, LaneDrop>; over?: string } };
  /** How much the timeline shows at first, until the viewer picks. */
  mode?: TimelineMode;
  /** How the middle is split at first, until the viewer picks. */
  middle?: MiddleLayout;
  className?: string;
}) {
  const base = replay ?? blank(project);
  const tl = timeline ?? EMPTY_TIMELINE;

  // Every lane, including ones the owner just made that have nothing in them yet.
  const lanes = useMemo<TlLane[]>(() => {
    const known = new Set(tl.lanes.map((l) => l.id));
    const fresh = (owner?.lanes ?? []).filter((l) => !known.has(l.id)).map((l) => ({ id: l.id, name: l.name, input: l.input, analyzer: l.analyzer, feeds: [], items: [] }));
    return [...tl.lanes, ...fresh];
  }, [tl.lanes, owner?.lanes]);
  const full = useMemo(() => ({ lanes, other: tl.other }), [lanes, tl.other]);
  const all = useMemo(() => lanes.flatMap((lane) => lane.items.map((item) => ({ item, lane }))).sort((a, b) => a.item.t - b.item.t), [lanes]);

  // Skip processing: the lanes, monitors and processing steps step aside; only each frame and the product updates stay.
  const [skipProcessing, setSkipProcessing] = useState(false);
  // When each video frame arrived. Skip processing runs the clock from the first frame to the last.
  const frameTimes = useMemo(() => {
    const ids = new Set((view.media ?? []).filter((m) => m.kind === "frame").map((m) => m.id));
    return all.filter(({ item, lane }) => !lane.locked && (ids.has(item.id) || item.rows.some((r) => ids.has(r)))).map((x) => x.item.t);
  }, [view.media, all]);
  // The clock covers every item, and quiet stretches between files are skipped like any other. It ends at the
  // last thing that happened, not at now, so a clip read yesterday is not squeezed into the left edge.
  // Work still running keeps the end at now. It starts at the first thing that happened, not when the project was made.
  const data = useMemo<ReplayData>(() => {
    if (!all.length) return base;
    if (skipProcessing && frameTimes.length) {
      const a = Math.min(...frameTimes), b = Math.max(...frameTimes);
      const pad = Math.max((b - a) * 0.04, 1000);
      return { ...base, start: a - pad, end: b + pad, jobs: [], events: all.filter((x) => frameTimes.includes(x.item.t)).map(({ item, lane }) => ({ t: item.t, text: `${lane.name}: ${item.label}` })) };
    }
    // "Project created" is left out, so a project made hours before its first file does not open on an empty stretch.
    const s = Math.min(all[0].item.t, ...base.events.filter((x) => x.t > base.start).map((x) => x.t), ...base.jobs.map((j) => j.from));
    const running = base.jobs.some((j) => j.to === null) || all.some((x) => x.item.state === "reading" || x.item.state === "waiting");
    // Ends with the data and the work on it. A setup change made afterwards (a product chosen again, a lane
    // renamed) is not data, so it does not leave an empty stretch after the last file.
    const last = Math.max(s + 60_000, ...all.map((x) => x.item.done), ...base.jobs.map((j) => j.to ?? j.from));
    const e = running ? Math.max(base.end, last) : last + (last - s) * 0.02;
    return {
      ...base, start: s, end: e,
      jobs: [...base.jobs, ...all.map(({ item }) => ({ nodes: [], from: item.t, to: item.done, failed: item.state === "failed" }))],
      events: [...base.events, ...all.map(({ item, lane }) => ({ t: item.t, text: `${lane.name}: ${item.label}` }))].sort((a, b) => a.t - b.t),
    };
  }, [base, all, skipProcessing, frameTimes]);
  const clock = useReplayClock(data, { start, autoplay, follow: !!owner });
  // t moves the playhead every frame; tq only steps a few times a second, so the panels are not redrawn per frame.
  const { tq, seek } = clock;
  const steps = useMemo(() => productSteps(products, data.start, data.end - data.start), [products, data.start, data.end]);
  const alerts = useMemo(() => alertsOf(apps ?? [], products), [apps, products]);
  const names = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p.name])), [products]);

  // Which media each item became, and how many rows of each product it fed. All by stored ids.
  const mediaOf = useMemo(() => {
    const byId = new Map((view.media ?? []).map((m) => [m.id, m]));
    const out = new Map<string, ShareMedia>();
    for (const { item } of all) {
      const m = byId.get(item.id) ?? item.rows.map((r) => byId.get(r)).find(Boolean);
      if (m) out.set(item.id, m);
    }
    return (item: TlItem) => out.get(item.id) ?? null;
  }, [view.media, all]);
  const fed = useMemo(() => fedMap(products, steps, all.map((x) => x.item)), [products, steps, all]);
  const fedOf = useCallback((id: string) => fed.get(id) ?? NONE, [fed]);

  const [picked, setPicked] = useState<string | null>(null);
  // The lane whose monitor fills the Preview. Null follows whichever lane changed last.
  const [focus, setFocus] = useState<string | null>(null);
  const [active, setActive] = useState((products.find((p) => p.data.some((d) => d.total > 0)) ?? products[0])?.id ?? "");
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState<"lanes" | "preview" | "products">("preview");
  const [split, setSplit] = useMiddle(middle);
  // Minimizing one panel maximizes the other; pressing a lit button again goes back to both.
  // Made once per split, not per frame, so the memoized panels are not redrawn while the playhead moves.
  const panels = useMemo(() => {
    const size = (me: "preview" | "story"): PanelSize => {
      const other = me === "preview" ? "story" : "preview";
      return {
        size: split === "split" ? "open" : split === me ? "max" : "min",
        onMin: () => setSplit(split === other ? "split" : other),
        onMax: () => setSplit(split === me ? "split" : me),
      };
    };
    return { preview: size("preview"), story: size("story") };
  }, [split, setSplit]);
  const grow = (me: "preview" | "story", share: string) => (split === "split" ? share : split === me ? "flex-1" : "flex-none");
  // Pressing play lets go of the picked file, so the preview follows the playhead again.
  if (clock.playing && picked) setPicked(null);

  const sel = all.find((x) => x.item.id === picked) ?? null;
  // Every lane has its own monitor; the Preview shows the one in focus, so a lane that landed last does not take it over.
  const monitors = useMemo(() => monitorsAt(lanes, tq, mediaOf), [lanes, tq, mediaOf]);
  const focusId = sel?.lane.id ?? (focus && monitors.some((m) => m.lane.id === focus) ? focus : latestLane(monitors));
  const fm = monitors.find((m) => m.lane.id === focusId) ?? null;
  const now = sel ?? (fm?.item ? { item: fm.item, lane: fm.lane } : null);
  const nowLane = sel?.lane ?? fm?.lane ?? null;
  const product = products.find((p) => p.id === active) ?? null;
  // The newest video frame the models have finished with, for Skip processing: the picture arrives together with its product rows, not ahead of them.
  const frame = useMemo(() => {
    const frames = all.filter(({ item, lane }) => !lane.locked && mediaOf(item)?.kind === "frame");
    return frames.findLast((x) => x.item.t <= tq) ?? frames[0] ?? null;
  }, [all, tq, mediaOf]);
  const hasFrames = useMemo(() => all.some(({ item, lane }) => !lane.locked && mediaOf(item)?.kind === "frame"), [all, mediaOf]);
  const framesOnly = skipProcessing && hasFrames;
  // With processing skipped each file is one dot: its read span folds into its arrival.
  const shownTl = useMemo(() => (framesOnly ? { lanes: full.lanes.map((l) => ({ ...l, items: l.items.map((i) => (i.done > i.t ? { ...i, done: i.t } : i)) })), other: full.other } : full), [framesOnly, full]);
  // Skip processing takes the waiting out: a row shows up when the frame it came from does, not when the AI got to it.
  // Each row is dated by its frame, so a later frame that was processed sooner does not bring its rows in early.
  const railProducts = useMemo(() => {
    if (!framesOnly) return products;
    const at = new Map<string, number>();
    for (const { item } of all) for (const r of item.rows) at.set(r, Math.min(at.get(r) ?? Infinity, item.t));
    return products.map((p) => ({ ...p, data: p.data.map((d) => ({ ...d, rows: d.rows.map((r) => (at.has(r.id) ? { ...r, arrived: at.get(r.id)! } : r)) })) }));
  }, [framesOnly, products, all]);
  const railSteps = useMemo(() => (framesOnly ? productSteps(railProducts, data.start, data.end - data.start) : steps), [framesOnly, railProducts, steps, data.start, data.end]);
  const railAlerts = useMemo(() => {
    if (!framesOnly) return alerts;
    const at = new Map<string, number>();
    for (const { item } of all) for (const r of item.rows) at.set(r, Math.min(at.get(r) ?? Infinity, item.t));
    return alerts.map((a) => (at.has(a.rowId) ? { ...a, at: at.get(a.rowId)! } : a));
  }, [framesOnly, alerts, all]);
  const types = useMemo(() => product?.data.map((d) => d.type), [product]);
  const shown = sel ? (sel.lane.locked ? null : mediaOf(sel.item)) : fm?.media ?? null;
  // The next few pictures are fetched ahead of the playhead, so each is ready when the preview gets to it.
  const nowT = now?.item.t ?? -Infinity;
  useEffect(() => {
    let n = 0;
    for (const { item, lane } of all) {
      if (n >= 4) break;
      if (item.t <= nowT || lane.locked) continue;
      const m = mediaOf(item);
      if (!m || (m.kind === "video" || m.kind === "audio")) continue;
      const i = new Image();
      i.decoding = "async";
      i.src = m.src;
      n++;
    }
  }, [all, nowT, mediaOf]);
  // Every step the project has, in the order it happened. The ones the playhead has not reached are dimmed in the list.
  const recent = useMemo<Recent[]>(() => {
    const out: Recent[] = [];
    for (const { item, lane } of all) for (const step of item.steps) out.push({ step, item, lane });
    for (const step of tl.other) out.push({ step, item: null, lane: null });
    return out.sort((a, b) => a.step.t - b.step.t).slice(0, RECENT_MAX);
  }, [all, tl.other]);
  const stepsSoFar = useMemo(() => recent.filter((r) => r.step.t <= tq).length, [recent, tq]);

  const stepTotal = useMemo(() => all.reduce((n, { item }) => n + item.steps.length, tl.other.length), [all, tl.other]);

  // One playhead step past the item's last row, since tq rounds down and would land just before it.
  const select = useCallback((item: TlItem) => { setPicked(item.id); setFocus(all.find((x) => x.item.id === item.id)?.lane.id ?? null); setTab("preview"); seek(Math.max(item.t, item.done) + clock.span / 480); }, [all, seek, clock.span]);
  // An alert opens the frame or file it came from, so the preview shows what tripped it; if that is gone, the playhead just goes there.
  const showAlert = useCallback((a: AppAlert) => {
    const hit = all.find((x) => x.item.rows.includes(a.rowId));
    if (hit) select(hit.item); else seek(a.at);
  }, [all, select, seek]);
  const [rail] = useRailWidth();
  const laneOwner = useMemo(() => owner && { lanes: owner.lanes ?? [], setup: owner.laneSetup, preview: owner.preview }, [owner]);
  const pickProduct = useCallback((id: string) => { setActive(id); setTab("products"); }, []);
  const name = useCallback((id: string) => lanes.find((l) => l.id === id)?.name ?? data.nodes.find((n) => n.id === id)?.label ?? (id === "files" ? "Files" : id), [lanes, data.nodes]);
  const exportBase = owner?.exportBase ?? `/api/explore/${project.slug}/export`;

  return (
    <MediaProvider media={view.media}>
    <div className={cn("@container flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground", className)}>
      <TopBar project={project} events={base.events.length} bar={owner?.bar} />

      {/* Phones: one panel at a time. */}
      <nav className="flex h-8 shrink-0 border-b bg-card @4xl:hidden" aria-label="Panels">
        {([["lanes", "Lanes", FolderOpen], ["preview", "Preview", Eye], ["products", "Products", Film]] as const).map(([id, text, Icon]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={cn("flex flex-1 items-center justify-center gap-1.5 border-b-2 text-xs", tab === id ? "border-electric text-foreground" : "border-transparent text-muted-foreground")}>
            <Icon className="size-3" />{text}
          </button>
        ))}
      </nav>

      {/* The products rail's width is --rail, which the viewer sets by dragging its edge. */}
      <div data-rail-grid style={rail ? ({ "--rail": `min(${rail}px, 50cqw)` } as React.CSSProperties) : undefined}
        className="grid min-h-0 flex-1 gap-px bg-border @4xl:grid-cols-[16rem_minmax(0,1fr)_var(--rail,18rem)] @7xl:grid-cols-[18rem_minmax(0,1fr)_var(--rail,21rem)]">
        <LaneRail lanes={lanes} names={names} mediaOf={mediaOf} tq={tq} selected={sel?.item.id} onSelect={select}
          owner={laneOwner}
          className={tab === "lanes" ? "flex" : "hidden @4xl:flex"} />

        <div className={cn("min-h-0 flex-col gap-px", tab === "preview" ? "flex" : "hidden @4xl:flex")}>
          {framesOnly ? (
            <ScenePreview media={frame ? mediaOf(frame.item) : null} item={frame?.item ?? null} lane={frame?.lane ?? null} hidden={view.media === null}
              types={types} product={product?.name} onOpen={setOpen} className="min-h-0 flex-1" />
          ) : (
            <>
            <ScenePreview media={shown} item={now?.item ?? null} lane={nowLane} hidden={view.media === null}
              types={types} product={product?.name} onOpen={setOpen} panel={panels.preview} className={cn("min-h-0", grow("preview", "flex-[3]"))} />
            {/* Monitor wall (one small screen per lane) is switched off for now. To bring it back, restore the import and this block:
            {panels.preview.size !== "min" && <MonitorWall monitors={monitors} focus={focusId} auto={focus === null && !sel} className="max-h-56 flex-none"
              onFocus={(id) => { setPicked(null); setFocus(id); setTab("preview"); }} onAuto={() => { setPicked(null); setFocus(null); }} />}
            */}
            </>
          )}
          {!framesOnly && <LaneStory total={stepTotal} item={sel?.item ?? null} lane={sel?.lane ?? null} fed={sel ? fedOf(sel.item.id) : NONE} names={names} recent={recent} tq={tq}
            onProduct={pickProduct} onSelect={select} owner={!!owner} panel={panels.story} className={cn("min-h-0", grow("story", "flex-[2]"))} />}
        </div>

        <ProductRail products={railProducts} steps={railSteps} tq={tq} active={product?.id} onSelect={pickProduct}
          delivery={apps?.length ? { count: railAlerts.filter((a) => a.at <= tq).length, node: <DeliveryPanel alerts={railAlerts} tq={tq} start={data.start} onShow={showAlert} wantsBrowser={apps.some((a) => a.on && a.rule.browserAlert)} /> } : undefined}
          fed={sel ? fedOf(sel.item.id) : undefined} from={sel?.item.label} edit={!!owner} exportBase={exportBase}
          className={tab === "products" ? "flex" : "hidden @4xl:flex"} />
      </div>

      {owner?.attention}
      {apps?.length ? <AlertNotifier alerts={alerts} apps={apps} tq={tq} playing={clock.playing} /> : null}
      <StudioTimelineView tl={shownTl} start={data.start} end={data.end} clock={clock} products={steps} alerts={alerts} onAlert={showAlert} fedOf={fedOf}
        selected={sel?.item.id} onSelect={select} activeProduct={product?.id} onProduct={pickProduct} frames={hasFrames ? { on: skipProcessing, set: setSkipProcessing, range: null } : undefined} defaultMode={mode ?? (owner ? "simple" : "steps")} />
      <div className="flex h-6 shrink-0 items-center gap-4 overflow-hidden border-t bg-card px-3 font-mono text-[10px] text-muted-foreground">
        <span className="shrink-0">{all.filter((x) => x.item.t <= tq).length} / {all.length} in</span>
        <span className="hidden shrink-0 @xl:inline">{stepsSoFar.toLocaleString("en-US")} steps so far</span>
        <span className="ml-auto shrink-0 text-signal">{owner ? "Recorded from this project · watching calls no model" : "Replay · 0 new model calls · $0.00"}</span>
      </div>

      {owner?.lanes && <StudioDropZone lanes={owner.lanes} />}
      <Lightbox media={view.media ?? []} id={open} onClose={() => setOpen(null)} onMove={setOpen} name={name} onSeek={seek} />
    </div>
    </MediaProvider>
  );
}

// ── top bar ──────────────────────────────────────────────────────────────

function TopBar({ project, events, bar }: { project: PublicProject; events: number; bar?: React.ReactNode }) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-3 border-b bg-card px-3">
      <Link href="/" aria-label="ARGUS home" className="flex shrink-0 items-center gap-2">
        <Logo />
        <span className="hidden font-mono text-[11px] uppercase tracking-[0.2em] text-electric @xl:inline">Studio</span>
      </Link>
      <span className="h-4 w-px bg-border" aria-hidden />
      <h1 className="min-w-0 truncate text-sm font-medium">{project.name}</h1>
      {bar ? (
        <span className="hidden truncate font-mono text-[11px] text-muted-foreground @3xl:inline">{project.kind} · {events.toLocaleString("en-US")} recorded events</span>
      ) : (
        <span className="hidden truncate font-mono text-[11px] text-muted-foreground @3xl:inline">{project.kind} · shared by {project.owner} · {when(project.sharedAt)} UTC</span>
      )}
      {bar ?? <div className="ml-auto flex shrink-0 items-center gap-2">
        <span className="hidden font-mono text-[10px] text-muted-foreground @4xl:inline">{events.toLocaleString("en-US")} recorded events</span>
        <span className="flex items-center gap-1.5 bg-electric/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-electric"><Eye className="size-3" />Public replay</span>
        <Link href="/projects" className="hidden items-center gap-1 bg-electric px-2 py-1 text-xs font-medium text-background hover:bg-electric/85 @xl:inline-flex">Make your own<ArrowRight className="size-3" /></Link>
      </div>}
    </div>
  );
}

// ── lightbox ────────────────────────────────────────────────────────────

function Lightbox({ media, id, onClose, onMove, name, onSeek }: {
  media: ShareMedia[]; id: string | null; onClose: () => void; onMove: (id: string) => void; name: (id: string) => string; onSeek: (t: number) => void;
}) {
  const i = media.findIndex((m) => m.id === id);
  const m = i >= 0 ? media[i] : null;
  return (
    <Dialog open={!!m} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-5xl">
        {m && (
          <div className="grid max-h-[85dvh] md:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="relative grid min-h-64 place-items-center bg-black">
              {m.kind === "audio" ? <audio src={m.src} controls className="w-full px-8" aria-label={m.name} /> : m.kind === "video" ? (
                m.src
                  ? <video key={m.id} src={m.src} controls autoPlay playsInline className="max-h-[85dvh] w-full" />
                  : <p className="p-10 text-center text-xs text-muted-foreground">This video is not available.</p>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link; next/image would cache it
                <span className="relative block"><img src={m.src} alt={m.name} className="max-h-[85dvh] w-full object-contain" /><MaskOverlay findings={m.findings} /></span>
              )}
              <button type="button" onClick={() => onMove(media[i - 1].id)} disabled={i <= 0} aria-label="Previous" className="absolute left-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center bg-background/70 hover:bg-background disabled:hidden"><ChevronLeft className="size-4" /></button>
              <button type="button" onClick={() => onMove(media[i + 1].id)} disabled={i >= media.length - 1} aria-label="Next" className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center bg-background/70 hover:bg-background disabled:hidden"><ChevronRight className="size-4" /></button>
            </div>
            <div className="flex min-h-0 flex-col gap-3 overflow-auto border-l p-4 text-xs">
              <div>
                <DialogTitle className="truncate text-sm">{m.name}</DialogTitle>
                <DialogDescription className="mt-1 font-mono text-[10px]">{m.kind} · {name(m.source)} · {when(m.t)} UTC · {i + 1} of {media.length}</DialogDescription>
              </div>
              <div>
                <p className={label}>What the model found</p>
                {m.findings.length === 0 ? <p className="mt-1 text-muted-foreground">{m.kind === "video" ? "Videos are read frame by frame." : "Nothing found in this one."}</p> : (
                  <ul className="mt-1 space-y-1">
                    {m.findings.map((f, k) => (
                      <li key={k} className="border bg-card px-2 py-1">
                        <p className="flex justify-between gap-2"><span>{f.label}</span>{f.confidence !== null && <span className="font-mono text-[10px] text-muted-foreground">{Math.round(f.confidence * 100)}%</span>}</p>
                        {f.detail && <p className="mt-0.5 text-[11px] text-muted-foreground">{f.detail}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">{placed(m.findings).length ? "Muse Spark names what it sees. SAM 3.1 drew the outlines; code measured them." : "The model names what it sees. Outlines appear only where SAM 3.1 located them."}</p>
              <button type="button" onClick={() => { onSeek(m.t); onClose(); }} className="mt-auto flex items-center justify-center gap-1.5 border px-2 py-1.5 hover:border-electric hover:text-electric"><Play className="size-3" />Jump the replay here</button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
