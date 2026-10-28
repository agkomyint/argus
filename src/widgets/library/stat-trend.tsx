"use client";

import { Empty } from "@/components/widgets/empty";
import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FILL, TICK, TOOLTIP } from "@/components/widgets/chart-style";
import { clock } from "@/lib/product-types";
import { cn } from "@/lib/utils";
import "./stat-trend.css";
import { HIDE, val } from "@/widgets/kit";
import type { WidgetProps } from "@/widgets/schema";

/** One number that matters, the line it moves along, and the busiest moment marked. */
export function StatTrend({ rows, bind, settings, size, sample }: WidgetProps) {
  const unit = String(settings.unit);
  const pts = rows.map((r) => ({ t: r.t, c: val(r, bind.value) }));
  // Video rows carry their second of the clip; label the axis with that, not the wall clock.
  const at = new Map(rows.flatMap((r) => (typeof r.at === "string" ? [[r.t, r.at] as const] : [])));
  if (pts.length === 0) return <Empty text="Nothing to show yet." />;
  const latest = pts[pts.length - 1];
  const id = `st-${size}-${sample ? "s" : "r"}`;

  if (size === "compact") {
    return (
      <ResponsiveContainer {...FILL}>
        <AreaChart data={pts} margin={{ top: 28, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--signal)" stopOpacity={0.4} />
              <stop offset="1" stopColor="var(--signal)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="t" {...HIDE} />
          <YAxis {...HIDE} domain={[0, "dataMax + 2"]} />
          <Area type="monotone" dataKey="c" stroke="var(--signal)" strokeWidth={2} fill={`url(#${id})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  const peak = pts.reduce((a, p) => (p.c > a.c ? p : a), pts[0]);
  const low = Math.min(...pts.map((p) => p.c));
  const avg = pts.reduce((n, p) => n + p.c, 0) / pts.length;
  const prev = pts.length > 1 ? pts[pts.length - 2].c : latest.c;
  const delta = latest.c - prev;
  const label = (t: number) => at.get(t) ?? clock(t);

  // Sized by its own box, not the window: the same widget sits in a narrow studio dock and a wide page.
  return (
    <div className="@container flex h-full min-h-72 flex-col border">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-1 px-4 pt-4">
        <div>
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className="size-1.5 animate-pulse bg-signal" /> {String(settings.caption)}
          </p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-5xl font-medium leading-none tabular-nums @lg:text-6xl">{latest.c}</span>
            <span className="text-sm text-muted-foreground">{unit}</span>
          </p>
        </div>
        <p className={cn("pb-1 font-mono text-xs", delta > 0 ? "text-signal" : delta < 0 ? "text-chart-4" : "text-muted-foreground")}>
          {delta === 0 ? "no change" : `${delta > 0 ? "▲ +" : "▼ "}${delta}`} <span className="text-muted-foreground">at {label(latest.t)}</span>
        </p>
      </div>
      <div className="min-h-40 min-w-0 flex-1 px-1 pt-2">
        <ResponsiveContainer {...FILL}>
          <AreaChart data={pts} margin={{ top: 18, right: 12, bottom: 0, left: -24 }}>
            <defs>
              <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="var(--signal)" stopOpacity={0.4} />
                <stop offset="1" stopColor="var(--signal)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={label} tick={TICK} axisLine={false} tickLine={false} minTickGap={40} />
            <YAxis allowDecimals={false} tick={TICK} axisLine={false} tickLine={false} domain={[0, (m: number) => Math.max(2, m)]} />
            <Tooltip {...TOOLTIP} labelFormatter={(t) => label(Number(t))} formatter={(v) => [String(v), unit]} />
            <ReferenceLine y={avg} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
            <Area type="monotone" dataKey="c" stroke="var(--signal)" strokeWidth={2} fill={`url(#${id})`} isAnimationActive={false} dot={pts.length <= 30 ? { r: 2, fill: "var(--signal)", stroke: "none" } : false} />
            {/* A ring on the newest reading, keyed by it so it pops once when a reading arrives. The line itself is not tweened: the axis rescales as points arrive and a tween would draw two lines. */}
            <ReferenceDot x={latest.t} y={latest.c} r={5} shape={(p: { cx?: number; cy?: number }) => <circle key={latest.t} cx={p.cx} cy={p.cy} r={5} className="st-ping" fill="none" stroke="var(--signal)" strokeWidth={2} />} />
            <ReferenceDot x={peak.t} y={peak.c} r={4} fill="var(--electric)" stroke="none" label={{ value: `peak ${peak.c}`, position: "top", fontSize: 10, fill: "var(--foreground)" }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <dl className="grid grid-cols-2 gap-px border-t bg-border @md:grid-cols-4">
        <Mini label="Highest" value={String(peak.c)} sub={label(peak.t)} />
        <Mini label="Lowest" value={String(low)} />
        <Mini label="Average" value={avg.toFixed(1)} sub="dashed line" />
        <Mini label="Readings" value={String(pts.length)} />
      </dl>
    </div>
  );
}

function Mini({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 bg-background px-4 py-2">
      <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="font-mono text-lg tabular-nums">{value}</dd>
      {sub && <p className="truncate font-mono text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
