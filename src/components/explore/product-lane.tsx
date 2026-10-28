"use client";

import "./product-lane.css";
import type { PublicProduct } from "@/components/explore/public-studio";
import { cn } from "@/lib/utils";
import { PALETTE } from "@/widgets/kit";

/** One moment a product got new records: when they arrived, how many, and the running total after. */
export type Step = { at: number; n: number; total: number };
export type ProductSteps = { id: string; name: string; color: string; steps: Step[]; total: number };

export const productColor = (i: number) => PALETTE[i % PALETTE.length];

/**
 * When each product was updated, from the real arrival time of every row. Arrivals that land in the same
 * slice of the timeline become one step, so a batch of 30 rows reads as "+30", not 30 dots on top of each other.
 */
export function productSteps(products: PublicProduct[], start: number, span: number, bins = 240): ProductSteps[] {
  return products.map((p, i) => {
    const slots = new Map<number, Step>();
    for (const d of p.data) for (const r of d.rows) {
      const k = Math.min(bins - 1, Math.max(0, Math.floor(((r.arrived - start) / (span || 1)) * bins)));
      const s = slots.get(k) ?? { at: r.arrived, n: 0, total: 0 };
      s.n++;
      s.at = Math.max(s.at, r.arrived);
      slots.set(k, s);
    }
    let total = 0;
    const steps = [...slots.entries()].sort((a, b) => a[0] - b[0]).map(([, s]) => ({ ...s, total: (total += s.n) }));
    return { id: p.id, name: p.name, color: productColor(i), steps, total };
  });
}

/** The newest step at or before t, if any. */
export const lastStep = (p: ProductSteps, t: number) => p.steps.findLast((s) => s.at <= t) ?? null;

/** Height a lane needs to give every product a readable band. */
export const laneHeight = (products: number, lane: number) => Math.max(lane, products * 18 + 4);

/**
 * The "Data products" lane under the agent lanes: one band per product, a line that steps up each time it got
 * records, a dot per update. Dots the playhead has passed are lit, and the newest one pops "+n" as it is crossed.
 */
export function ProductLane({ products, start, span, t, height, active, onSeek, onSelect, when }: {
  products: ProductSteps[]; start: number; span: number; t: number; height: number; active?: string;
  onSeek: (t: number) => void; onSelect: (id: string) => void; when: (t: number) => string;
}) {
  const shown = products.filter((p) => p.steps.length > 0);
  if (shown.length === 0) return null;
  const x = (at: number) => Math.min(100, Math.max(0, ((at - start) / (span || 1)) * 100));
  const band = 100 / shown.length;

  return (
    <div className="flex border-b border-border/50 last:border-b-0" style={{ height }}>
      <div className="flex w-44 shrink-0 flex-col justify-center border-r px-2" style={{ gap: 2 }}>
        <span className="font-mono text-[9px] uppercase text-muted-foreground">Data products</span>
        {shown.length > 1 && height >= shown.length * 14 + 14 && shown.map((p) => (
          <button key={p.id} type="button" onClick={() => onSelect(p.id)} className={cn("flex min-w-0 items-center gap-1.5 text-left text-[10px] leading-tight hover:text-foreground", p.id === active ? "text-foreground" : "text-muted-foreground")}>
            <span className="size-1.5 shrink-0" style={{ background: p.color }} /><span className="truncate">{p.name}</span>
          </button>
        ))}
        {shown.length === 1 && <span className="truncate text-[11px]">{shown[0].name}</span>}
      </div>
      <div className="relative h-full min-w-0 flex-1 overflow-hidden">
        <svg className="absolute inset-0 size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {shown.map((p, i) => {
            const top = i * band + band * 0.22;
            const bottom = (i + 1) * band - band * 0.18;
            const y = (total: number) => bottom - (total / p.total) * (bottom - top);
            let d = `M ${x(start)} ${bottom}`;
            for (const s of p.steps) d += ` H ${x(s.at)} V ${y(s.total)}`;
            d += " H 100";
            return <path key={p.id} d={d} fill="none" stroke={p.color} strokeWidth={p.id === active ? 2 : 1.25} strokeOpacity={p.id === active ? 1 : 0.7} vectorEffect="non-scaling-stroke" />;
          })}
        </svg>
        {/* Not reached yet: dimmed, like the agent lanes. */}
        <span className="pointer-events-none absolute inset-y-0 right-0 bg-card/70" style={{ left: `${x(t)}%` }} />
        {shown.map((p, i) => {
          const top = i * band + band * 0.22;
          const bottom = (i + 1) * band - band * 0.18;
          const last = lastStep(p, t);
          return p.steps.map((s) => {
            const y = bottom - (s.total / p.total) * (bottom - top);
            const passed = s.at <= t;
            const size = 5 + Math.min(5, Math.round(Math.log2(s.n + 1) * 1.5));
            return (
              <button
                key={`${p.id}-${s.at}`} type="button"
                onClick={() => { onSeek(s.at); onSelect(p.id); }}
                title={`+${s.n.toLocaleString("en-US")} ${s.n === 1 ? "record" : "records"} · ${p.name} · ${when(s.at)}`}
                aria-label={`${p.name}: ${s.n} new records at ${when(s.at)}`}
                className="group absolute z-[1] -translate-x-1/2 -translate-y-1/2 p-1"
                style={{ left: `${x(s.at)}%`, top: `${y}%` }}
              >
                <span
                  className={cn("block rounded-full border border-card transition-transform group-hover:scale-150", passed ? "" : "opacity-40", s === last && "pl-pop")}
                  style={{ width: size, height: size, background: p.color, boxShadow: passed ? `0 0 6px ${p.color}` : undefined }}
                />
                {/* Keyed by the step, so it only plays when the playhead crosses a new one. */}
                {s === last && <span key={s.at} className="pl-rise pointer-events-none absolute bottom-full left-1/2 font-mono text-[10px] font-medium tabular-nums" style={{ color: p.color }}>+{s.n}</span>}
              </button>
            );
          });
        })}
        <span className="pointer-events-none absolute inset-y-0 w-px bg-foreground" style={{ left: `${x(t)}%` }} />
      </div>
    </div>
  );
}
