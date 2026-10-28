"use client";

import { Empty } from "@/components/widgets/empty";
import { moment, PALETTE, text } from "@/widgets/kit";
import type { FlatRow, WidgetProps } from "@/widgets/schema";

type Mask = { kind: string; frame: [number, number]; box: [number, number, number, number]; outline: string | null; share: number; at: string };

const pair = (v: unknown): [number, number] | null => (Array.isArray(v) && v.length === 2 && v.every(Number.isFinite) ? [Number(v[0]), Number(v[1])] : null);
const quad = (v: unknown) => (Array.isArray(v) && v.length === 4 && v.every(Number.isFinite) ? (v.map(Number) as Mask["box"]) : null);

function masksOf(rows: FlatRow[], fields: string[]): Mask[] {
  return rows.flatMap((r) => {
    const frame = pair(r.frame);
    const box = quad(r.box);
    if (!frame || !box) return [];
    return [{ kind: text(r, fields, "object"), frame, box, outline: typeof r.outline === "string" ? r.outline : null, share: Number(r.area_pct) || 0, at: moment(r) }];
  });
}

/** One frame's objects drawn as their outlines on an empty frame: where they were and how much room they took. */
function Frame({ masks, color, className }: { masks: Mask[]; color: (k: string) => string; className?: string }) {
  const [w, h] = masks[0].frame;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" className={className} role="img" aria-label={`${masks.length} objects located in the latest frame`}>
      <rect width={w} height={h} className="fill-muted/40 stroke-border" strokeWidth={Math.max(1, w / 400)} vectorEffect="non-scaling-stroke" />
      {masks.map((m, i) => (
        <g key={i} style={{ color: color(m.kind) }}>
          {m.outline
            ? <path d={m.outline} fill="currentColor" fillOpacity={0.35} stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            : <rect x={m.box[0]} y={m.box[1]} width={m.box[2] - m.box[0]} height={m.box[3] - m.box[1]} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
        </g>
      ))}
    </svg>
  );
}

/**
 * Where each kind of object is and how much of the frame it covers, from SAM's masks. The latest frame is
 * drawn as outlines only, so it reads the same with or without the picture. Shares are of the whole frame.
 */
export function Footprint({ rows, bind, settings, size }: WidgetProps) {
  const masks = masksOf(rows, bind.category);
  if (masks.length === 0) return <Empty text="No objects located yet." />;
  const lastAt = masks[masks.length - 1].at;
  const latest = masks.filter((m) => m.at === lastAt);

  const byKind = new Map<string, { n: number; share: number; frames: Set<string> }>();
  for (const m of masks) {
    const k = byKind.get(m.kind) ?? { n: 0, share: 0, frames: new Set<string>() };
    k.n++;
    k.share += m.share;
    k.frames.add(m.at);
    byKind.set(m.kind, k);
  }
  const kinds = [...byKind].map(([kind, k]) => ({ kind, n: k.n, avg: k.share / k.n, perFrame: k.n / k.frames.size })).sort((a, b) => b.n - a.n);
  const color = (k: string) => PALETTE[Math.max(0, kinds.findIndex((x) => x.kind === k)) % PALETTE.length];

  if (size === "compact") {
    return <div className="flex h-full items-center justify-center p-3 pt-7"><Frame masks={latest} color={color} className="max-h-full w-full" /></div>;
  }

  const top = kinds.slice(0, Number(settings.top) || 6);
  const widest = Math.max(...top.map((k) => k.avg), 0.01);
  const covered = Math.min(100, latest.reduce((a, m) => a + m.share, 0));
  const stat = "font-mono text-[10px] uppercase tracking-wider text-muted-foreground";

  return (
    <div className="@container h-full overflow-auto [scrollbar-gutter:stable]">
      <div className="grid gap-3">
        <dl className="grid grid-cols-2 gap-px border bg-border @md:grid-cols-4">
          {[
            ["Located", masks.length.toLocaleString("en-US")],
            ["Kinds", String(kinds.length)],
            ["In latest frame", String(latest.length)],
            ["Frame covered", `${covered.toFixed(covered < 10 ? 1 : 0)}%`],
          ].map(([k, v]) => (
            <div key={k} className="bg-background p-3">
              <dt className={stat}>{k}</dt>
              <dd className="mt-1 truncate text-lg font-medium tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="grid gap-3 @lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <figure className="border p-2">
            <Frame masks={latest} color={color} className="w-full" />
            <figcaption className="mt-2 font-mono text-[10px] text-muted-foreground">Latest frame{lastAt ? ` · ${lastAt}` : ""} · outlines from SAM</figcaption>
          </figure>
          <ul className="grid content-start gap-2 border p-3">
            <li className={`${stat} grid grid-cols-[minmax(0,1fr)_3rem_4rem] gap-2`}><span>Kind</span><span className="text-right">Seen</span><span className="text-right">Avg. size</span></li>
            {top.map((k) => (
              <li key={k.kind} className="grid gap-1">
                <div className="grid grid-cols-[minmax(0,1fr)_3rem_4rem] items-baseline gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2 capitalize"><span aria-hidden className="size-2 shrink-0" style={{ background: color(k.kind) }} /><span className="truncate">{k.kind}</span></span>
                  <span className="text-right tabular-nums">{k.n}</span>
                  <span className="text-right tabular-nums text-muted-foreground">{k.avg.toFixed(k.avg < 10 ? 1 : 0)}%</span>
                </div>
                <span aria-hidden className="block h-1 transition-[width] duration-500 ease-out" style={{ width: `${(k.avg / widest) * 100}%`, background: color(k.kind) }} />
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[11px] text-muted-foreground">Size is each object&apos;s share of the whole frame, from its mask. Positions are in the picture, not on a map.</p>
      </div>
    </div>
  );
}
