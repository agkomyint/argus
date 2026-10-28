"use client";

import { ChevronDown, Download, Maximize2, Plus } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import "./product-rail.css";
import type { PublicProduct } from "@/components/explore/public-studio";
import { lastStep, type ProductSteps } from "@/components/explore/product-lane";
import { openStudioWindow } from "@/components/studio/studio-window";
import type { Fed } from "@/components/studio/studio-timeline";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Widget } from "@/components/widgets";
import type { Dataset } from "@/lib/product-types";
import { cn } from "@/lib/utils";

const label = "font-mono text-[10px] uppercase tracking-wider text-muted-foreground";

/** A product's datasets as they stood at one moment: only rows that had arrived by then. */
export function asOf(data: Dataset[], cut: number): Dataset[] {
  return data.map((d) => {
    const rows = d.rows.filter((r) => r.arrived <= cut);
    const later = d.rows.length - rows.length;
    return { ...d, rows, total: Math.max(0, d.total - later), latest: rows.length ? Math.max(...rows.map((r) => r.t)) : null };
  });
}

/** The last arrival at or before t. Rows only change when this does, so charts are not redrawn every frame. */
const cutOf = (p: PublicProduct, t: number) => p.data.reduce((a, d) => d.rows.reduce((b, r) => (r.arrived <= t && r.arrived > b ? r.arrived : b), a), -Infinity);

const RAIL_KEY = "argus.studio.rail";
const CARDS_KEY = "argus.studio.cards";
/** How tall an open chart is until someone drags it, and how far it can go. */
const CARD_H = 220;
const CARD_MIN = 120;
const CARD_MAX = 720;

const listeners = new Map<string, (f: () => void) => () => void>();
const listenTo = (key: string) => {
  let l = listeners.get(key);
  if (!l) {
    l = (f) => { window.addEventListener("storage", f); window.addEventListener(key, f); return () => { window.removeEventListener("storage", f); window.removeEventListener(key, f); }; };
    listeners.set(key, l);
  }
  return l;
};

/** A size this viewer picked, kept in their browser. Without storage it lasts for the visit only. */
function useStored<T>(key: string) {
  const raw = useSyncExternalStore(listenTo(key), () => { try { return localStorage.getItem(key); } catch { return null; } }, () => null);
  const value = useMemo(() => { try { return raw === null ? null : (JSON.parse(raw) as T); } catch { return null; } }, [raw]);
  const set = useCallback((v: T | null) => {
    try { if (v === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v)); } catch { /* kept for this visit only */ }
    window.dispatchEvent(new Event(key));
  }, [key]);
  return [value, set] as const;
}

/** How wide the viewer made the products rail, in pixels; null is the studio's own width. */
export function useRailWidth() {
  return useStored<number>(RAIL_KEY);
}

/** Drags a size while the pointer moves, writing it straight to the page, and keeps it once let go. */
function drag(e: React.PointerEvent, move: (ev: PointerEvent) => number, write: (v: number) => void, done: (v: number) => void) {
  e.preventDefault();
  let v = move(e.nativeEvent);
  const onMove = (ev: PointerEvent) => { v = move(ev); write(v); };
  const up = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", up); document.body.style.cursor = ""; done(v); };
  document.body.style.cursor = getComputedStyle(e.currentTarget).cursor;
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", up);
}

/**
 * The right of the studio: every data product as a small live card, its count at the playhead and a line of
 * how it grew. When a picked file fed a product, its card says how much. Click a card to open its chart in
 * place, and as many as you like stay open down the rail; the one clicked last is the one the preview follows.
 * Drag the rail's left edge to give the charts more room, and a chart's bottom edge to make it taller; both
 * are kept per viewer and a double-click resets them. The corner button opens a chart full size with its CSV.
 */
export function ProductRail({ products, steps, tq, active, onSelect, fed, from, edit, exportBase, startOpen, className }: {
  products: PublicProduct[]; steps: ProductSteps[]; tq: number; active?: string; onSelect: (id: string) => void;
  /** What the picked file added to each product, and what to call that file. */
  fed?: Fed; from?: string; edit?: boolean; exportBase: string;
  /** Which charts start open, as /design does to show them; otherwise the active one. */
  startOpen?: string[]; className?: string;
}) {
  const [full, setFull] = useState<string | null>(null);
  const big = products.find((p) => p.id === full) ?? null;
  // Which charts are open. The product the studio starts on is open, so the rail never begins as a bare list.
  const [open, setOpen] = useState<Set<string>>(() => new Set(startOpen ?? (active ? [active] : [])));
  const toggle = useCallback((id: string) => {
    const n = new Set(open);
    if (n.has(id)) n.delete(id);
    else { n.add(id); onSelect(id); }
    setOpen(n);
  }, [open, onSelect]);
  // A product picked elsewhere, such as its mark on the timeline, opens here too.
  const [was, setWas] = useState(active);
  if (active !== was) {
    setWas(active);
    if (active && !open.has(active)) setOpen(new Set(open).add(active));
  }
  const all = products.length > 0 && products.every((p) => open.has(p.id));
  const [, setRail] = useRailWidth();
  const [heights, setHeights] = useStored<Record<string, number>>(CARDS_KEY);
  const setHeight = useCallback((id: string, h: number | null) => {
    const n = { ...heights };
    if (h === null) delete n[id]; else n[id] = h;
    setHeights(n);
  }, [heights, setHeights]);

  // The rail sits in the studio's grid; its width is the grid's --rail, so the middle gives way as it grows.
  const resize = (e: React.PointerEvent<HTMLDivElement>) => {
    const grid = e.currentTarget.closest<HTMLElement>("[data-rail-grid]");
    if (!grid) return;
    const r = grid.getBoundingClientRect();
    const width = (ev: PointerEvent) => Math.round(Math.min(Math.max(240, r.width * 0.5), Math.max(240, r.right - ev.clientX)));
    drag(e, width, (w) => grid.style.setProperty("--rail", `${w}px`), (w) => setRail(w));
  };
  const reset = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.closest<HTMLElement>("[data-rail-grid]")?.style.removeProperty("--rail");
    setRail(null);
  };

  return (
    <aside aria-label="Data products" className={cn("relative flex min-h-0 flex-col bg-card", className)}>
      <div role="separator" aria-orientation="vertical" aria-label="Resize the data products" onPointerDown={resize} onDoubleClick={reset} title="Drag to resize · double-click to reset"
        className="absolute inset-y-0 -left-1 z-10 hidden w-2 cursor-col-resize touch-none after:absolute after:inset-y-0 after:left-1 after:w-px hover:after:bg-electric @4xl:block" />
      <div className="flex h-8 shrink-0 items-center justify-between border-b px-2">
        <span className={label}>Data products</span>
        <span className="flex items-center gap-2">
          {products.length > 1 && (
            <button type="button" onClick={() => setOpen(all ? new Set() : new Set(products.map((p) => p.id)))} className="font-mono text-[10px] text-muted-foreground hover:text-foreground">
              {all ? "close all" : "open all"}
            </button>
          )}
          {edit ? <button type="button" onClick={() => openStudioWindow("products")} className="flex items-center gap-1 text-[11px] text-electric hover:text-foreground"><Plus className="size-3" />Product</button>
            : <span className="font-mono text-[9px] text-muted-foreground">{products.length}</span>}
        </span>
      </div>
      <div className="min-h-0 flex-1 space-y-px overflow-y-auto bg-border [scrollbar-gutter:stable]">
        {products.length === 0 ? (
          <div className="grid h-full place-content-center gap-2 bg-card p-4 text-center text-[11px] text-muted-foreground">
            <p>{edit ? "No data products yet. Pick what this project should build, and ARGUS links your lanes to it." : "This project has no data products."}</p>
            {edit && <button type="button" onClick={() => openStudioWindow("products")} className="mx-auto flex items-center gap-1.5 bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/85"><Plus className="size-3.5" />Add a data product</button>}
          </div>
        ) : products.map((p, i) => (
          <ProductCard key={p.id} product={p} steps={steps[i]} tq={tq} active={p.id === active} open={open.has(p.id)} onToggle={toggle} onFull={setFull}
            height={heights?.[p.id] ?? CARD_H} onHeight={setHeight} added={fed?.find((f) => f.id === p.id)?.n} from={from} />
        ))}
      </div>
      <Dialog open={!!big} onOpenChange={(o) => !o && setFull(null)}>
        <DialogContent className="flex h-[80dvh] flex-col gap-3 sm:max-w-5xl">
          {big && <Full product={big} tq={tq} exportBase={exportBase} />}
        </DialogContent>
      </Dialog>
    </aside>
  );
}

const ProductCard = memo(function ProductCard({ product, steps, tq, active, open, onToggle, onFull, height, onHeight, added, from }: {
  product: PublicProduct; steps?: ProductSteps; tq: number; active: boolean; open: boolean; onToggle: (id: string) => void; onFull: (id: string) => void;
  height: number; onHeight: (id: string, h: number | null) => void; added?: number; from?: string;
}) {
  const cut = cutOf(product, tq);
  const data = useMemo(() => asOf(product.data, cut), [product.data, cut]);
  const shown = data.reduce((a, d) => a + d.total, 0);
  const last = steps ? lastStep(steps, tq) : null;
  const color = steps?.color ?? "var(--electric)";
  const kinds = data.filter((d) => d.total > 0).length;
  const body = useRef<HTMLDivElement>(null);

  // What the playhead just added, floated up once beside the count. Going back in time adds nothing.
  const [prev, setPrev] = useState(shown);
  const [gain, setGain] = useState<{ n: number; at: number } | null>(null);
  if (shown !== prev) {
    setPrev(shown);
    setGain(shown > prev ? { n: shown - prev, at: cut } : null);
  }

  const resize = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = body.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    const h = (ev: PointerEvent) => Math.round(Math.min(CARD_MAX, Math.max(CARD_MIN, ev.clientY - top)));
    drag(e, h, (v) => { el.style.height = `${v}px`; }, (v) => onHeight(product.id, v));
  };

  return (
    <section aria-label={product.name} className={cn("relative bg-card transition-colors", active && "bg-[color-mix(in_oklab,var(--card),var(--pc)_6%)]")} style={{ "--pc": color } as React.CSSProperties}>
      <span className={cn("absolute inset-x-0 top-0 h-0.5 transition-opacity", active ? "opacity-100" : "opacity-40")} style={{ background: color }} aria-hidden />
      <div className="flex items-start gap-2 p-2 pt-2.5">
        <button type="button" onClick={() => onToggle(product.id)} aria-expanded={open} className="group min-w-0 flex-1 text-left" title={product.summary}>
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <span key={last?.at ?? "none"} className={cn("size-1.5 shrink-0 rounded-full", last && "pl-pop")} style={{ background: color, color, opacity: last ? 1 : 0.35 }} aria-hidden />
            <span className="truncate">{product.name}</span>
            <ChevronDown className={cn("size-3 shrink-0 text-muted-foreground transition-transform group-hover:text-foreground", !open && "-rotate-90")} />
          </span>
          <span className="mt-1.5 flex items-end gap-2">
            <Count value={shown} className="font-mono text-xl leading-none tabular-nums" />
            <span className="relative pb-px font-mono text-[10px] text-muted-foreground">
              {shown === 1 ? "record" : "records"}{kinds > 1 ? ` · ${kinds} kinds` : ""}
              {gain && <span key={gain.at} className="pr-rise absolute -top-3.5 left-0 font-semibold" style={{ color }}>+{gain.n.toLocaleString("en-US")}</span>}
            </span>
          </span>
          {steps && <Spark steps={steps} tq={tq} color={color} />}
        </button>
        <button type="button" onClick={() => onFull(product.id)} aria-label={`Open ${product.name} full size`} title="Open full size" className="grid size-6 shrink-0 place-items-center text-muted-foreground hover:bg-accent hover:text-foreground"><Maximize2 className="size-3" /></button>
      </div>
      {added ? <p className="-mt-1 px-2 pb-1.5 font-mono text-[10px] text-signal">+{added} from {from ?? "this file"}</p> : null}
      {open && (
        <div className="relative border-t">
          <div ref={body} className="overflow-auto p-1.5 [scrollbar-width:thin]" style={{ height }}>
            {shown ? <Widget productId={product.id} data={data} /> : (
              <div className="grid size-full place-content-center gap-1.5 border border-dashed text-center">
                <span className="mx-auto size-2 rounded-full opacity-40" style={{ background: color }} aria-hidden />
                <p className="text-[11px]">No records yet at this point.</p>
                <p className="font-mono text-[10px] text-muted-foreground">Press play to watch it fill.</p>
              </div>
            )}
          </div>
          <div role="separator" aria-orientation="horizontal" aria-label={`Resize ${product.name}`} onPointerDown={resize} onDoubleClick={() => { if (body.current) body.current.style.height = ""; onHeight(product.id, null); }}
            title="Drag to resize · double-click to reset" className="group/grip flex h-2.5 cursor-row-resize touch-none items-center justify-center border-t border-transparent hover:border-electric/60">
            <span className="h-0.5 w-8 rounded-full bg-border transition-colors group-hover/grip:bg-electric" />
          </div>
        </div>
      )}
    </section>
  );
});

/**
 * A count that runs up to its new value instead of jumping, written to the page directly so the card is not
 * rendered again for each number on the way.
 */
function Count({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(value);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const start = from.current;
    from.current = value;
    const put = (n: number) => { el.textContent = Math.round(n).toLocaleString("en-US"); };
    if (start === value || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { put(value); return; }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 450);
      put(start + (value - start) * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); put(value); };
  }, [value]);
  return <span ref={ref} className={className}>{value.toLocaleString("en-US")}</span>;
}

/** How the product grew up to the playhead, as a small filled line across the card. */
function Spark({ steps, tq, color }: { steps: ProductSteps; tq: number; color: string }) {
  const W = 200;
  const H = 20;
  if (!steps.steps.length) return <span className="mt-1.5 block h-5 border-b border-dashed border-muted-foreground/40" aria-hidden />;
  const first = steps.steps[0].at;
  const end = Math.max(first + 1, steps.steps.at(-1)!.at);
  const seen = steps.steps.filter((s) => s.at <= tq);
  const y = (n: number) => H - (n / (steps.total || 1)) * (H - 2);
  const pts = [[0, H], ...seen.flatMap((s, i) => { const x = ((s.at - first) / (end - first)) * W; return [[x, y(i ? seen[i - 1].total : 0)], [x, y(s.total)]]; })];
  const lastX = pts.at(-1)![0];
  const line = pts.map((p) => p.join(",")).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-1.5 block h-5 w-full overflow-visible" aria-hidden>
      <line x1="0" y1={H} x2={W} y2={H} stroke="currentColor" className="text-border" vectorEffect="non-scaling-stroke" />
      <polygon points={`${line} ${lastX},${H}`} fill={color} opacity="0.15" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Full({ product, tq, exportBase }: { product: PublicProduct; tq: number; exportBase: string }) {
  const data = useMemo(() => asOf(product.data, tq), [product.data, tq]);
  return (
    <>
      <div>
        <DialogTitle>{product.name}</DialogTitle>
        <DialogDescription className="mt-1">{product.summary} As it stood at the playhead.</DialogDescription>
      </div>
      <div className="min-h-0 flex-1 border p-2"><Widget productId={product.id} data={data} /></div>
      <div className="flex flex-wrap gap-2">
        {product.data.map((d) => (
          <a key={d.type} href={`${exportBase}?product=${product.id}&type=${d.type}`} title="Every record in this project, not just up to the playhead" className="flex items-center gap-1 border px-2 py-1 font-mono text-[11px] text-muted-foreground hover:border-electric hover:text-foreground"><Download className="size-3" />{d.type}.csv</a>
        ))}
      </div>
    </>
  );
}
