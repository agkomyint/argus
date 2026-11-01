"use client";

import { ChevronDown, ChevronLeft, ChevronRight, Download, Focus, Maximize2, Minimize2, Plus } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import "./product-rail.css";
import type { PublicProduct } from "@/components/explore/public-studio";
import { lastStep, type ProductSteps } from "@/components/explore/product-lane";
import { openStudioWindow } from "@/components/studio/studio-window";
import type { Fed } from "@/components/studio/studio-timeline";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Widget } from "@/components/widgets";
import { clock, type Dataset } from "@/lib/product-types";
import { cn } from "@/lib/utils";

/** How long before the playhead something happened, in a few words. */
const ago = (ms: number) => (ms < 2000 ? "just now" : ms < 60_000 ? `${Math.round(ms / 1000)}s ago` : ms < 3_600_000 ? `${Math.round(ms / 60_000)}m ago` : ms < 86_400_000 ? `${Math.round(ms / 3_600_000)}h ago` : `${Math.round(ms / 86_400_000)}d ago`);

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

/** A widget draws its own scroll box. In the rail the card is the only box, so those scroll boxes open out instead. */
const NO_SCROLL = "[&_.overflow-auto]:!h-auto [&_.overflow-auto]:!overflow-visible";

const RAIL_KEY = "argus.studio.rail";
const CARDS_KEY = "argus.studio.cards";
/** How tall an open chart is until someone drags it, and how far it can go. */
const CARD_H = 150;
const CARD_MIN = 90;
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
export function ProductRail({ products, steps, tq, active, onSelect, fed, from, edit, exportBase, startOpen, startFocus, delivery, className }: {
  products: PublicProduct[]; steps: ProductSteps[]; tq: number; active?: string; onSelect: (id: string) => void;
  /** What the picked file added to each product, and what to call that file. */
  fed?: Fed; from?: string; edit?: boolean; exportBase: string;
  /** Which charts start open, as /design does to show them; otherwise the active one. */
  startOpen?: string[];
  /** A product that starts focused, as /design shows it. */
  startFocus?: string;
  /** The Delivery tab beside Data products: what the apps found. Without it the rail has no tabs. */
  delivery?: { count: number; node: React.ReactNode };
  className?: string;
}) {
  const [pane, setPane] = useState<"products" | "delivery">("products");
  const [full, setFull] = useState<string | null>(null);
  const [wide, setWide] = useState(false);
  // Focus: one chart takes the whole rail and the others fold to their headers. Pressing it again, or open all, goes back.
  const [focus, setFocus] = useState<string | null>(startFocus ?? null);
  const focused = products.some((p) => p.id === focus) ? focus : null;
  const big = products.find((p) => p.id === full) ?? null;
  // Three sizes. Small is where every product starts: just its header. Medium opens the chart at its usual height. Small folds a chart to its header,
  // and large (focus) gives one chart the whole rail while the others drop to small. Only the small ones are kept here.
  const [shut, setShut] = useState<Set<string>>(() => new Set(products.map((p) => p.id).filter((id) => !(startOpen ?? []).includes(id))));
  // A product that turns up later starts small too.
  const [known, setKnown] = useState(() => new Set(products.map((p) => p.id)));
  if (products.some((p) => !known.has(p.id))) {
    setKnown(new Set(products.map((p) => p.id)));
    setShut(new Set([...shut, ...products.map((p) => p.id).filter((id) => !known.has(id))]));
  }
  const open = useMemo(() => ({ has: (id: string) => !shut.has(id) }), [shut]);
  const toggle = useCallback((id: string) => {
    if (focused) { setFocus(id === focused ? null : id); onSelect(id); return; }
    // Opening one folds the rest, so only one is ever open unless "all medium" is pressed.
    if (shut.has(id)) { setShut(new Set(products.map((p) => p.id).filter((x) => x !== id))); onSelect(id); }
    else setShut(new Set([...shut, id]));
  }, [shut, onSelect, focused, products]);
  // A product picked elsewhere, such as its mark on the timeline, opens here too.
  const [was, setWas] = useState(active);
  if (active !== was) {
    setWas(active);
    if (active && shut.has(active)) setShut(new Set(products.map((p) => p.id).filter((x) => x !== active)));
  }
  const all = products.every((p) => !shut.has(p.id));
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
        {delivery ? (
          <span role="tablist" aria-label="Rail" className="flex h-full">
            {(["products", "delivery"] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={pane === t} onClick={() => setPane(t)} className={cn(label, "-mb-px border-b-2 px-2", pane === t ? "border-electric text-foreground" : "border-transparent hover:text-foreground")}>
                {t === "products" ? "Data products" : "Delivery"}{t === "delivery" && delivery.count > 0 && <span className="ml-1.5 bg-destructive px-1 text-white">{delivery.count}</span>}
              </button>
            ))}
          </span>
        ) : <span className={label}>Data products</span>}
        <span className={cn("flex items-center gap-2", pane === "delivery" && delivery && "hidden")}>
          {products.length > 1 && (
            <button type="button" onClick={() => { setFocus(null); setShut(all ? new Set(products.map((p) => p.id)) : new Set()); }} className="font-mono text-[10px] text-muted-foreground hover:text-foreground">
              {all ? "all small" : "all medium"}
            </button>
          )}
          {edit ? <button type="button" onClick={() => openStudioWindow("products")} className="flex items-center gap-1 text-[11px] text-electric hover:text-foreground"><Plus className="size-3" />Product</button>
            : <span className="font-mono text-[9px] text-muted-foreground">{products.length}</span>}
        </span>
      </div>
      {delivery && pane === "delivery" ? <div className="min-h-0 flex-1 overflow-y-auto bg-card [scrollbar-gutter:stable]">{delivery.node}</div> : (
      <div className={cn("min-h-0 flex-1 gap-px overflow-y-auto bg-border [scrollbar-gutter:stable]", focused ? "flex flex-col" : "space-y-px")}>
        {products.length === 0 ? (
          <div className="grid h-full place-content-center gap-2 bg-card p-4 text-center text-[11px] text-muted-foreground">
            <p>{edit ? "No data products yet. Pick what this project should build, and ARGUS links your lanes to it." : "This project has no data products."}</p>
            {edit && <button type="button" onClick={() => openStudioWindow("products")} className="mx-auto flex items-center gap-1.5 bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/85"><Plus className="size-3.5" />Add a data product</button>}
          </div>
        ) : products.map((p, i) => (
          <ProductCard key={p.id} product={p} steps={steps[i]} tq={tq} active={p.id === active} open={focused ? p.id === focused : open.has(p.id)} focused={p.id === focused} onFocus={(id) => { setFocus(id === focused ? null : id); onSelect(id); }} onToggle={toggle} onFull={setFull}
            height={heights?.[p.id] ?? CARD_H} onHeight={setHeight} added={fed?.find((f) => f.id === p.id)?.n} from={from} />
        ))}
      </div>
      )}
      <Dialog open={!!big} onOpenChange={(o) => !o && setFull(null)}>
        <DialogContent className={cn("flex h-[100dvh] max-w-none flex-col gap-3 overflow-y-auto rounded-none p-3 sm:p-4", wide ? "sm:h-[94dvh] sm:max-w-[96vw]" : "sm:h-[80dvh] sm:max-w-5xl")}>
          {big && <Full product={big} products={products} steps={steps} tq={tq} exportBase={exportBase} wide={wide} onWide={() => setWide(!wide)} onPick={setFull} />}
        </DialogContent>
      </Dialog>
    </aside>
  );
}

const ProductCard = memo(function ProductCard({ product, steps, tq, active, open, focused, onFocus, onToggle, onFull, height, onHeight, added, from }: {
  product: PublicProduct; steps?: ProductSteps; tq: number; active: boolean; open: boolean; focused: boolean; onFocus: (id: string) => void; onToggle: (id: string) => void; onFull: (id: string) => void;
  height: number; onHeight: (id: string, h: number | null) => void; added?: number; from?: string;
}) {
  const cut = cutOf(product, tq);
  const data = useMemo(() => asOf(product.data, cut), [product.data, cut]);
  const shown = data.reduce((a, d) => a + d.total, 0);
  const last = steps ? lastStep(steps, tq) : null;
  const color = steps?.color ?? "var(--electric)";
  const have = data.filter((d) => d.total > 0);
  const kinds = have.length;
  const empty = shown === 0;
  const age = Number.isFinite(cut) ? ago(Math.max(0, tq - cut)) : null;
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
    <section aria-label={product.name} className={cn("relative bg-card transition-colors", focused && "flex flex-1 flex-col", active && "bg-[color-mix(in_oklab,var(--card),var(--pc)_6%)]")} style={{ "--pc": color } as React.CSSProperties}>
      <span className={cn("absolute inset-x-0 top-0 h-0.5 transition-opacity", active ? "opacity-100" : "opacity-40")} style={{ background: color }} aria-hidden />
      <div className={cn("flex shrink-0 gap-2", open ? "items-start p-2 pt-2.5" : "h-8 items-center px-2 pt-0.5")}>
        <button type="button" onClick={() => onToggle(product.id)} aria-expanded={open} className="group min-w-0 flex-1 text-left" title={product.summary}>
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <span key={last?.at ?? "none"} className={cn("size-1.5 shrink-0 rounded-full", last && "pl-pop")} style={{ background: color, color, opacity: last ? 1 : 0.35 }} aria-hidden />
            <span className="truncate">{product.name}</span>
            <ChevronDown className={cn("size-3 shrink-0 text-muted-foreground transition-transform group-hover:text-foreground", !open && "-rotate-90")} />
            {!open && (
              <span className="ml-auto flex shrink-0 items-baseline gap-1 pl-2">
                {gain && <span key={gain.at} className="pr-rise font-mono text-[10px] font-semibold" style={{ color }}>+{gain.n.toLocaleString("en-US")}</span>}
                <Count value={shown} className={cn("font-mono text-xs leading-none tabular-nums", empty && "text-muted-foreground")} />
              </span>
            )}
          </span>
          {open && <>
          <span className="mt-1.5 flex items-end gap-2">
            <Count value={shown} className={cn("font-mono leading-none tabular-nums", empty ? "text-sm text-muted-foreground" : "text-xl")} />
            <span className="relative pb-px font-mono text-[10px] text-muted-foreground">
              {shown === 1 ? "record" : "records"}{kinds > 1 ? ` · ${kinds} kinds` : ""}
              {gain && <span key={gain.at} className="pr-rise absolute -top-3.5 left-0 font-semibold" style={{ color }}>+{gain.n.toLocaleString("en-US")}</span>}
            </span>
          </span>
          {empty ? <span className="mt-1 block font-mono text-[10px] text-muted-foreground">waiting for data</span> : (
            <>
              <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] text-muted-foreground">
                {have.length > 1 && have.slice(0, 3).map((d) => <span key={d.type} className="max-w-[9rem] truncate">{d.type} <span className="text-foreground">{d.total.toLocaleString("en-US")}</span></span>)}
                {have.length > 3 && <span>+{have.length - 3} more</span>}
                {age && <span className="ml-auto shrink-0">{age}</span>}
              </span>
            </>
          )}
          </>}
        </button>
        <button type="button" onClick={() => onFocus(product.id)} aria-pressed={focused} aria-label={focused ? "Show every product again" : `Focus ${product.name}: fold the others away`} title={focused ? "Show every product again" : "Focus this one: fold the others away"} className={cn("grid size-6 shrink-0 place-items-center hover:bg-accent hover:text-foreground", focused ? "bg-electric/15 text-electric" : "text-muted-foreground")}><Focus className="size-3" /></button>
        <button type="button" onClick={() => onFull(product.id)} aria-label={`Open ${product.name} full size`} title="Open full size" className="grid size-6 shrink-0 place-items-center text-muted-foreground hover:bg-accent hover:text-foreground"><Maximize2 className="size-3" /></button>
      </div>
      {added && open ? <p className="-mt-1 px-2 pb-1.5 font-mono text-[10px] text-signal">+{added} from {from ?? "this file"}</p> : null}
      {open && (
        <div className={cn("relative border-t", focused && "flex flex-1 flex-col")}>
          <div ref={body} className={cn("p-1.5", NO_SCROLL, focused ? "min-h-[22rem] flex-1" : "overflow-hidden")} style={focused ? undefined : { height: `min(${height}px, 60dvh)` }}>
            {shown ? <Widget productId={product.id} data={data} size={focused ? "full" : "compact"} /> : (
              <div className="grid size-full place-content-center gap-1.5 border border-dashed text-center">
                <span className="mx-auto size-2 rounded-full opacity-40" style={{ background: color }} aria-hidden />
                <p className="text-[11px]">No records yet at this point.</p>
              </div>
            )}
          </div>
          {!focused && <div role="separator" aria-orientation="horizontal" aria-label={`Resize ${product.name}`} onPointerDown={resize} onDoubleClick={() => { if (body.current) body.current.style.height = ""; onHeight(product.id, null); }}
            title="Drag to resize · double-click to reset" className="group/grip flex h-2.5 cursor-row-resize touch-none items-center justify-center border-t border-transparent hover:border-electric/60">
            <span className="h-0.5 w-8 rounded-full bg-border transition-colors group-hover/grip:bg-electric" />
          </div>}
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

function Full({ product, products, steps, tq, exportBase, wide, onWide, onPick }: {
  product: PublicProduct; products: PublicProduct[]; steps: ProductSteps[]; tq: number; exportBase: string; wide: boolean; onWide: () => void; onPick: (id: string) => void;
}) {
  const data = useMemo(() => asOf(product.data, tq), [product.data, tq]);
  const at = products.findIndex((p) => p.id === product.id);
  const step = (d: 1 | -1) => { const n = products[(at + d + products.length) % products.length]; if (n) onPick(n.id); };
  const total = data.reduce((a, d) => a + d.total, 0);
  const latest = data.reduce<number | null>((m, d) => (d.latest !== null && (m === null || d.latest > m) ? d.latest : m), null);
  const color = steps[at]?.color ?? "var(--electric)";
  return (
    <>
      <div className="flex items-start gap-2 pr-8">
        <div className="min-w-0 flex-1">
          <DialogTitle className="flex items-center gap-2"><span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden /><span className="truncate">{product.name}</span></DialogTitle>
          <DialogDescription className="mt-1 line-clamp-2">{product.summary} As it stood at the playhead.</DialogDescription>
        </div>
        {products.length > 1 && (
          <span className="flex shrink-0 items-center gap-0.5">
            <button type="button" onClick={() => step(-1)} aria-label="Previous product" title="Previous product" className="grid size-7 place-items-center border hover:bg-accent"><ChevronLeft className="size-3.5" /></button>
            <span className="px-1 font-mono text-[10px] text-muted-foreground">{at + 1}/{products.length}</span>
            <button type="button" onClick={() => step(1)} aria-label="Next product" title="Next product" className="grid size-7 place-items-center border hover:bg-accent"><ChevronRight className="size-3.5" /></button>
          </span>
        )}
        <button type="button" onClick={onWide} aria-pressed={wide} aria-label={wide ? "Smaller" : "Larger"} title={wide ? "Smaller" : "Larger"} className="hidden size-7 shrink-0 place-items-center border hover:bg-accent sm:grid">{wide ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}</button>
      </div>
      <dl className="grid shrink-0 grid-cols-2 gap-px border bg-border text-center sm:grid-cols-4">
        {([["Records", total.toLocaleString("en-US")], ["Kinds", String(data.filter((d) => d.total > 0).length)], ["Latest", latest === null ? "none yet" : clock(latest)], ["Whole project", product.data.reduce((a, d) => a + d.total, 0).toLocaleString("en-US")]] as const).map(([k, v]) => (
          <div key={k} className="bg-card px-2 py-1.5"><dt className={label}>{k}</dt><dd className="mt-0.5 truncate font-mono text-sm tabular-nums">{v}</dd></div>
        ))}
      </dl>
      <div className="min-h-64 flex-1 overflow-auto border p-2"><Widget productId={product.id} data={data} /></div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {product.data.map((d) => (
          <a key={d.type} href={`${exportBase}?product=${product.id}&type=${d.type}`} title="Every record in this project, not just up to the playhead" className="flex items-center gap-1 border px-2 py-1 font-mono text-[11px] text-muted-foreground hover:border-electric hover:text-foreground"><Download className="size-3" />{d.type}.csv <span className="text-foreground">{(data.find((x) => x.type === d.type)?.total ?? 0).toLocaleString("en-US")}</span></a>
        ))}
      </div>
    </>
  );
}
