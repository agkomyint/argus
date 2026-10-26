"use client";

import { ArrowLeft, ArrowRight, History, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { openProject } from "@/app/actions";
import { StateBadge, type AgentState } from "@/components/design/agent-kit";
import { DeleteProjectDialog } from "@/components/dashboard/delete-project-dialog";
import { NewProjectDialog, type PickableProduct } from "@/components/dashboard/new-project-dialog";
import { AutoRefresh } from "@/components/dashboard/pipeline-controls";
import { ShareProjectDialog } from "@/components/dashboard/share-project-dialog";
import { SlideSourceDialog } from "@/components/dashboard/slide-source-dialog";
import { ProductPreview } from "@/components/widgets/product-preview";
import { Button } from "@/components/ui/button";
import type { SourceSuggestion } from "@/lib/product-sources";
import type { Dataset } from "@/lib/product-types";
import { cn } from "@/lib/utils";

export type Slide = {
  id: string;
  name: string;
  kind: string;
  shareSlug: string | null;
  products: { id: string; name: string; kind: string; rows: number; data: Dataset[] }[];
  more: number;
  sources: { key: string; name: string; state: AgentState; done: number; total: number; unit: string }[];
  suggestions: SourceSuggestion[];
  level: string;
  cost: string;
};

const label = "font-mono text-[10px] uppercase tracking-wider text-muted-foreground";

/**
 * One project per slide, neighbours peeking at the edges. The last slide starts a new project.
 * Swipe or scroll sideways on touch; arrows, dots and ← → on desktop.
 */
export function ProjectSlides({ slides, start, items }: { slides: Slide[]; start: number; items: PickableProduct[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(start);
  const [creating, setCreating] = useState(false);
  const total = slides.length + 1;

  const go = useCallback((i: number, smooth = true) => {
    const el = track.current;
    const n = Math.min(Math.max(i, 0), total - 1);
    const child = el?.children[n] as HTMLElement | undefined;
    if (!el || !child) return;
    el.scrollTo({ left: child.offsetLeft - (el.clientWidth - child.clientWidth) / 2, behavior: smooth ? "smooth" : "instant" });
    setAt(n);
  }, [total]);

  useEffect(() => { go(start, false); }, [go, start]);

  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const mid = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    [...el.children].forEach((c, i) => {
      const h = c as HTMLElement;
      if (Math.abs(h.offsetLeft + h.clientWidth / 2 - mid) < Math.abs((el.children[best] as HTMLElement).offsetLeft + (el.children[best] as HTMLElement).clientWidth / 2 - mid)) best = i;
    });
    if (best !== at) setAt(best);
  };

  const busy = slides.some((s) => s.sources.some((x) => x.state === "working"));

  return (
    <div
      tabIndex={0}
      aria-roledescription="carousel"
      aria-label="Your projects"
      className="outline-none"
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest("input,textarea,[role=dialog]")) return;
        if (e.key === "ArrowRight") { e.preventDefault(); go(at + 1); }
        if (e.key === "ArrowLeft") { e.preventDefault(); go(at - 1); }
      }}
    >
      <AutoRefresh active={busy} everyMs={5000} />
      <div
        ref={track}
        onScroll={onScroll}
        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain px-[6%] py-1 [scrollbar-width:none] sm:-mx-8 [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((s, i) => (
          <section
            key={s.id}
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${total}: ${s.name}`}
            onClick={i === at ? undefined : () => go(i)}
            className={cn("flex w-[88%] shrink-0 snap-center flex-col border bg-background transition-opacity", i !== at && "cursor-pointer opacity-40")}
          >
            <div className="flex flex-wrap items-start justify-between gap-4 p-5 pb-0 sm:p-6 sm:pb-0">
              <div className="min-w-0">
                <p className={label}>{s.kind}</p>
                <h2 className="mt-1 truncate text-2xl font-medium tracking-tight">{s.name}</h2>
              </div>
              <div className="flex items-center gap-2">
                <DeleteProjectDialog id={s.id} name={s.name} />
                <ShareProjectDialog id={s.id} name={s.name} slug={s.shareSlug} />
                <form action={openProject.bind(null, s.id, "/dashboard/replay")}>
                  <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground"><History className="size-4" />Replay</Button>
                </form>
                <form action={openProject.bind(null, s.id, "/dashboard")}>
                  <Button type="submit" size="sm">Open →</Button>
                </form>
              </div>
            </div>

            {s.products.length === 0 ? (
              <p className="m-5 flex-1 border border-dashed p-10 text-center text-sm text-muted-foreground sm:m-6">No data products yet. Open it to add one.</p>
            ) : (
              <ul className="grid flex-1 content-start gap-4 p-5 sm:grid-cols-2 sm:p-6">
                {s.products.map((p) => (
                  <li key={p.id} className="border">
                    <ProductPreview productId={p.id} kind={p.kind} data={p.data} />
                    <div className="flex items-baseline justify-between gap-2 p-3">
                      <span className="truncate text-sm font-medium">{p.name}</span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{p.rows ? `${p.rows.toLocaleString("en-US")} rows` : "no data yet"}</span>
                    </div>
                  </li>
                ))}
                {s.more > 0 && <li className="self-center text-sm text-muted-foreground">+ {s.more} more inside</li>}
              </ul>
            )}

            {/* Sources stay small: each one with its state, the dials, and one button. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-5 py-2.5 sm:px-6">
              <span className={label}>Sources</span>
              {s.sources.length === 0 ? (
                <span className="text-xs text-muted-foreground">None yet. Products are showing sample data.</span>
              ) : (
                <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {s.sources.map((x) => (
                    <li key={x.key} className="flex items-center gap-1.5 text-xs">
                      {x.name}
                      <StateBadge state={x.state} />
                      {x.total > 0 && <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{x.done}/{x.total}</span>}
                    </li>
                  ))}
                </ul>
              )}
              <span className="ml-auto flex items-center gap-3">
                {s.sources.length > 0 && (
                  <form action={openProject.bind(null, s.id, "/dashboard/agents")}>
                    <button type="submit" className="font-mono text-[11px] text-muted-foreground tabular-nums hover:text-foreground">{s.level} · {s.cost}</button>
                  </form>
                )}
                <SlideSourceDialog projectId={s.id} suggestions={s.suggestions} empty={s.sources.length === 0} />
              </span>
            </div>
          </section>
        ))}

        <section aria-roledescription="slide" aria-label={`${total} of ${total}: New project`} className={cn("grid min-h-96 w-[88%] shrink-0 snap-center transition-opacity", at !== total - 1 && "opacity-40")}>
          <button
            type="button"
            onClick={() => (at === total - 1 ? setCreating(true) : go(total - 1))}
            className="grid place-items-center border border-dashed p-6 text-center hover:bg-accent/30"
          >
            <span>
              <span className="mx-auto grid size-10 place-items-center border"><Plus className="size-5" /></span>
              <span className="mt-3 block font-medium">New project</span>
              <span className="mt-1 block text-sm text-muted-foreground">Name it, pick the data products you want, done.</span>
            </span>
          </button>
        </section>
      </div>

      <nav className="mt-4 flex items-center justify-center gap-4" aria-label="Projects">
        <Button variant="outline" size="icon" onClick={() => go(at - 1)} disabled={at === 0} aria-label="Previous project"><ArrowLeft className="size-4" /></Button>
        <ol className="flex items-center gap-1.5">
          {slides.map((s, i) => (
            <li key={s.id}>
              <button type="button" onClick={() => go(i)} aria-label={s.name} aria-current={i === at} className={cn("block h-1.5 transition-all", i === at ? "w-6 bg-electric" : "w-1.5 bg-border hover:bg-muted-foreground")} />
            </li>
          ))}
          <li>
            <button type="button" onClick={() => go(total - 1)} aria-label="New project" aria-current={at === total - 1} className={cn("grid size-5 place-items-center border border-dashed text-muted-foreground", at === total - 1 && "border-electric text-electric")}><Plus className="size-3" /></button>
          </li>
        </ol>
        <Button variant="outline" size="icon" onClick={() => go(at + 1)} disabled={at === total - 1} aria-label="Next project"><ArrowRight className="size-4" /></Button>
      </nav>
      <p className="mt-2 text-center font-mono text-[11px] text-muted-foreground tabular-nums">{at < slides.length ? `${at + 1} / ${slides.length} · ${slides[at].name}` : "New project"}</p>

      <NewProjectDialog items={items} open={creating} onOpenChange={setCreating} />
    </div>
  );
}
