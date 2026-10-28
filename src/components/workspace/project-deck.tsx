"use client";

import { ArrowLeft, ArrowRight, Maximize, Maximize2, Minimize, Minimize2, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { openProject } from "@/app/actions";
import { stateHint, type AgentState } from "@/components/design/agent-kit";
import { Logo } from "@/components/landing/logo";
import { AskArgus } from "@/components/assistant/ask-argus";
import { NewProjectDialog, type PickableProduct } from "@/components/workspace/new-project-dialog";
import type { AskMessage, AskProject } from "@/lib/assistant";
import { AutoRefresh } from "@/components/workspace/pipeline-controls";
import { ProjectMenu } from "@/components/workspace/project-menu";
import { Button } from "@/components/ui/button";
import type { Dataset } from "@/lib/product-types";
import { cn } from "@/lib/utils";
import { getProduct } from "@/products";
import { widgetFor } from "@/widgets/resolve";
import { MediaProvider } from "@/widgets/media";
import { WidgetView } from "@/widgets/use";

export type Slide = {
  id: string;
  name: string;
  description: string;
  kind: string;
  shareSlug: string | null;
  shareMedia?: boolean;
  products: { id: string; name: string; kind: string; rows: number; data: Dataset[] }[];
  more: number;
  sources: { key: string; name: string; state: AgentState; done: number; total: number; unit: string }[];
  level: string;
  cost: string;
};

const label = "font-mono text-[10px] uppercase tracking-wider text-muted-foreground";
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Panels per row and row count for n products. Up to three rows fill the stage with no scroll;
 * past that, rows keep a fixed height and the stage scrolls, so any number of products fits.
 */
function layout(n: number) {
  const cols = n <= 3 ? Math.max(n, 1) : n === 4 ? 2 : n <= 6 ? 3 : n === 9 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  return {
    "--cols": `repeat(${cols},minmax(0,1fr))`,
    "--rows": rows <= 3 ? `repeat(${rows},minmax(0,1fr))` : "none",
    "--auto": rows <= 3 ? "auto" : "18rem",
  } as React.CSSProperties;
}

/**
 * Projects as a full-screen deck, one project per slide, for showing someone what you built.
 * The slide shows; the studio configures. ← → move, F presents full screen, Enter opens the studio.
 */
export function ProjectDeck({ slides, start, items, bar, ask, askRecorded, showSample = false, className }: {
  slides: Slide[]; start: number; items: PickableProduct[]; bar?: React.ReactNode;
  /** The projects Ask ARGUS can see. Shows the Ask button in the header; it starts on the slide on screen. */
  ask?: AskProject[];
  /** Play a recorded chat instead of calling the model. Previews only. */
  askRecorded?: AskMessage[];
  /** Draw generated sample rows where a product has none. Only for previews; a real project never shows made-up charts. */
  showSample?: boolean;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLOListElement>(null);
  const [at, setAt] = useState(Math.min(start, slides.length));
  const [dir, setDir] = useState<1 | -1>(1);
  const [creating, setCreating] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const total = slides.length + 1;
  const s = slides[at];

  const go = useCallback((i: number) => {
    const n = Math.min(Math.max(i, 0), total - 1);
    setDir(n >= at ? 1 : -1);
    setAt(n);
  }, [at, total]);

  useEffect(() => {
    (strip.current?.children[at] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [at]);

  useEffect(() => {
    const sync = () => setPresenting(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const present = () => (document.fullscreenElement ? document.exitFullscreen() : root.current?.requestFullscreen())?.catch(() => {});

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("input,textarea,select,[role=dialog]")) return;
    if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); go(at + 1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(at - 1); }
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(total - 1);
    else if (e.key === "f" || e.key === "F") present();
    else if (e.key === "Enter" && e.target === root.current) {
      if (s) (document.getElementById(`open-${s.id}`) as HTMLFormElement | null)?.requestSubmit();
      else setCreating(true);
    }
  };

  const busy = slides.some((x) => x.sources.some((y) => y.state === "working"));

  return (
    <div
      ref={root}
      tabIndex={0}
      onKeyDown={onKey}
      aria-roledescription="carousel"
      aria-label="Your projects"
      className={cn("flex flex-col overflow-hidden bg-background text-foreground outline-none", className)}
    >
      <AutoRefresh active={busy} everyMs={5000} />

      <header className="flex h-11 shrink-0 items-center gap-3 border-b bg-card px-3 sm:px-4">
        <Link href="/" aria-label="ARGUS home" className="flex shrink-0 items-center"><Logo /></Link>
        <span className="h-4 w-px bg-border" aria-hidden />
        <span className={cn(label, "text-foreground")}>Projects</span>
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{s ? `${pad(at + 1)} / ${pad(slides.length)}` : "New"}</span>
        <div className="ml-auto flex items-center gap-2">
          {ask && <AskArgus projects={ask} current={s?.id} recorded={askRecorded} />}
          {bar}
          <Button variant="outline" size="sm" onClick={present} aria-label={presenting ? "Leave full screen" : "Present full screen"}>
            {presenting ? <Minimize className="size-4" /> : <Maximize className="size-4" />}<span className="hidden sm:inline">{presenting ? "Exit" : "Present"}</span>
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}><Plus className="size-4" /><span className="hidden sm:inline">New project</span></Button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-2 lg:overflow-hidden lg:p-3">
        <div
          key={s?.id ?? "new"}
          aria-roledescription="slide"
          aria-label={s ? `${at + 1} of ${slides.length}: ${s.name}` : "New project"}
          className={cn("h-full animate-in fade-in duration-300 motion-reduce:animate-none", dir === 1 ? "slide-in-from-right-8" : "slide-in-from-left-8")}
        >
          {s ? <ProjectSlide s={s} showSample={showSample} /> : <NewSlide onCreate={() => setCreating(true)} />}
        </div>
      </main>

      <nav aria-label="All projects" title="← → move · F present · Enter open studio" className="flex h-10 shrink-0 items-stretch gap-1.5 border-t bg-card p-1.5">
        <Button variant="ghost" size="icon" className="h-auto" onClick={() => go(at - 1)} disabled={at === 0} aria-label="Previous project"><ArrowLeft className="size-4" /></Button>
        <ol ref={strip} className="flex min-w-0 flex-1 gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {slides.map((x, i) => (
            <li key={x.id} className="shrink-0">
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={i === at}
                className={cn("flex h-full w-40 items-center gap-1.5 border px-3 text-left transition-colors hover:bg-accent/40", i === at ? "border-electric bg-electric/5" : "opacity-70 hover:opacity-100")}
              >
                <span className={cn("font-mono text-[10px] tabular-nums", i === at ? "text-electric" : "text-muted-foreground")}>{pad(i + 1)}</span>
                <span className="truncate text-xs font-medium">{x.name}</span>
                {x.sources.some((y) => y.state === "working") && <span className="ml-auto size-1.5 shrink-0 animate-pulse rounded-full bg-electric" />}
              </button>
            </li>
          ))}
          <li className="shrink-0">
            <button
              type="button"
              onClick={() => (at === total - 1 ? setCreating(true) : go(total - 1))}
              aria-current={at === total - 1}
              className={cn("flex h-full items-center gap-1 border border-dashed px-3 text-xs text-muted-foreground hover:bg-accent/40", at === total - 1 && "border-electric text-electric")}
            >
              <Plus className="size-3.5" />New project
            </button>
          </li>
        </ol>
        <Button variant="ghost" size="icon" className="h-auto" onClick={() => go(at + 1)} disabled={at === total - 1} aria-label="Next project"><ArrowRight className="size-4" /></Button>
      </nav>

      <NewProjectDialog items={items} open={creating} onOpenChange={setCreating} />
    </div>
  );
}

const DOT: Record<AgentState, string> = { working: "bg-electric animate-pulse", waiting: "bg-muted-foreground", paused: "bg-chart-4", done: "bg-signal", error: "bg-destructive" };

function ProjectSlide({ s, showSample }: { s: Slide; showSample: boolean }) {
  const [focus, setFocus] = useState<string | null>(null);
  const tiles = s.products.length + (s.more > 0 ? 1 : 0);
  const form = `open-${s.id}`;
  const shown = focus ? s.products.filter((p) => p.id === focus) : s.products;

  return (
    <article
      className="flex h-full flex-col gap-2 lg:gap-3"
      onKeyDown={(e) => { if (e.key === "Escape" && focus) { e.stopPropagation(); setFocus(null); } }}
    >
      <form id={form} action={openProject.bind(null, s.id)} hidden />

      {/* One line about the project; the products get the rest of the screen. */}
      <header className="flex min-h-11 shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border bg-card px-3 py-1.5">
        <h2 className="truncate text-base font-medium tracking-tight">{s.name}</h2>
        {s.description && <p className="hidden min-w-0 flex-1 truncate text-sm text-muted-foreground md:block" title={s.description}>{s.description}</p>}
        <ul className="ml-auto flex min-w-0 items-center gap-1.5" aria-label="Data sources">
          {s.sources.length === 0 && <li className="font-mono text-[10px] text-muted-foreground">No sources yet</li>}
          {s.sources.slice(0, 3).map((x) => (
            <li key={x.key} title={`${x.name} · ${stateHint(x.state)}`} className="flex max-w-44 items-center gap-1.5 border px-2 py-0.5 text-xs">
              <span className={cn("size-1.5 shrink-0 rounded-full", DOT[x.state])} />
              <span className="truncate">{x.name}</span>
              {x.total > 0 && <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{x.done}/{x.total}</span>}
            </li>
          ))}
          {s.sources.length > 3 && <li className="font-mono text-[10px] text-muted-foreground">+{s.sources.length - 3}</li>}
        </ul>
        <ProjectMenu id={s.id} name={s.name} description={s.description} slug={s.shareSlug} media={s.shareMedia} />
        <Button type="submit" form={form} size="sm">Open in Studio →</Button>
      </header>

      {tiles === 0 ? (
        <button type="submit" form={form} className="grid min-h-60 flex-1 place-items-center border border-dashed bg-card/40 p-8 text-center hover:bg-accent/30">
          <span>
            <span className="mx-auto grid size-10 place-items-center border"><Plus className="size-5" /></span>
            <span className="mt-3 block font-medium">No data products yet</span>
            <span className="mt-1 block text-sm text-muted-foreground">Set them up in the studio.</span>
          </span>
        </button>
      ) : (
        <MediaProvider base={`/api/studio/${s.id}/media/`}>
          <ul
            style={layout(focus ? 1 : tiles)}
            className="grid min-h-0 flex-1 auto-rows-[18rem] grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-2 lg:grid-cols-(--cols) lg:grid-rows-(--rows) lg:auto-rows-(--auto) lg:gap-3 lg:overflow-y-auto"
          >
            {shown.map((p) => (
              <li key={p.id} className="min-h-0">
                <Panel p={p} form={form} showSample={showSample} focused={focus === p.id} onFocus={() => setFocus(focus === p.id ? null : p.id)} />
              </li>
            ))}
            {!focus && s.more > 0 && (
              <li className="min-h-0">
                <button type="submit" form={form} className="grid h-full w-full place-items-center border border-dashed text-sm text-muted-foreground hover:bg-accent/30">+ {s.more} more in the studio</button>
              </li>
            )}
          </ul>
        </MediaProvider>
      )}
    </article>
  );
}

/** One product. Small panels draw the widget's compact view; the expand button gives it the whole stage. */
function Panel({ p, form, showSample, focused, onFocus }: { p: Slide["products"][number]; form: string; showSample: boolean; focused: boolean; onFocus: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const real = p.data.some((d) => d.total > 0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setCompact(e.contentRect.width < 260 || e.contentRect.height < 170));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <section aria-label={p.name} className="group flex h-full flex-col border bg-card transition-colors hover:border-electric/50">
      <header className="flex h-8 shrink-0 items-center gap-2 border-b pl-3 pr-1">
        <button type="submit" form={form} title="Open in the studio to configure" className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:text-electric">{p.name}</button>
        {!real && showSample && <span className="shrink-0 bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Sample</span>}
        {p.rows > 0 && <span title={`${p.rows.toLocaleString("en-US")} rows`} className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">{p.rows.toLocaleString("en-US")}</span>}
        <button
          type="button"
          onClick={onFocus}
          aria-label={focused ? `Back to all products` : `Expand ${p.name}`}
          aria-pressed={focused}
          className="grid size-6 shrink-0 place-items-center text-muted-foreground opacity-60 hover:bg-accent hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
        >
          {focused ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </button>
      </header>
      <div ref={box} className="relative min-h-0 flex-1 overflow-hidden p-2">
        {real || showSample ? (
          <WidgetView use={widgetFor(getProduct(p.id) ?? { kind: p.kind })} data={p.data} size={compact && !focused ? "compact" : "full"} showSample />
        ) : (
          <button type="submit" form={form} className="grid size-full place-items-center border border-dashed text-center text-sm hover:bg-accent/30">
            <span><span className="block text-muted-foreground">No data yet</span><span className="mt-1 block text-electric">Set up in Studio →</span></span>
          </button>
        )}
      </div>
    </section>
  );
}

function NewSlide({ onCreate }: { onCreate: () => void }) {
  return (
    <button type="button" onClick={onCreate} className="grid h-full min-h-80 w-full place-items-center border border-dashed bg-card/40 p-8 text-center hover:bg-accent/30">
      <span>
        <span className="mx-auto grid size-14 place-items-center border"><Plus className="size-6" /></span>
        <span className="mt-4 block text-2xl font-medium tracking-tight">New project</span>
        <span className="mt-2 block text-muted-foreground">Name it, say what it watches, pick the data products. Then connect sources in the studio.</span>
      </span>
    </button>
  );
}
