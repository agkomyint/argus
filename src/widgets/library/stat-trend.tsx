"use client";

import { Empty } from "@/components/widgets/empty";
import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TICK, TOOLTIP } from "@/components/widgets/chart-style";
import { clock } from "@/lib/product-types";
import { HIDE, val } from "@/widgets/kit";
import type { WidgetProps } from "@/widgets/schema";

/** One number that matters, the line it moves along, and the busiest moment marked. */
export function StatTrend({ rows, bind, settings, size, sample }: WidgetProps) {
  const unit = String(settings.unit);
  const pts = rows.map((r) => ({ t: r.t, c: val(r, bind.value) }));
  if (pts.length === 0) return <Empty text="Nothing to show yet." />;
  const latest = pts[pts.length - 1];
  const id = `st-${size}-${sample ? "s" : "r"}`;

  if (size === "compact") {
    return (
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
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

  return (
    <div className="border">
      <div className="grid gap-6 p-5 sm:grid-cols-[auto_1fr] sm:items-end">
        <div>
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className="size-1.5 animate-pulse bg-signal" /> {String(settings.caption)}
          </p>
          <p className="mt-1 font-mono text-7xl font-medium leading-none tabular-nums">{latest.c}</p>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            {delta === 0 ? "no change" : `${delta > 0 ? "+" : ""}${delta} since the last reading`} · {clock(latest.t)}
          </p>
        </div>
        <div className="h-48 min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart data={pts} margin={{ top: 16, right: 8, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="var(--signal)" stopOpacity={0.4} />
                  <stop offset="1" stopColor="var(--signal)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={clock} tick={TICK} axisLine={false} tickLine={false} minTickGap={48} />
              <YAxis allowDecimals={false} tick={TICK} axisLine={false} tickLine={false} domain={[0, (m: number) => Math.max(2, m)]} />
              <Tooltip {...TOOLTIP} labelFormatter={(t) => clock(Number(t))} formatter={(v) => [String(v), unit]} />
              <ReferenceLine y={avg} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
              <Area type="monotone" dataKey="c" stroke="var(--signal)" strokeWidth={2} fill={`url(#${id})`} isAnimationActive={false} />
              <ReferenceDot x={peak.t} y={peak.c} r={5} fill="var(--electric)" stroke="none" label={{ value: `peak ${peak.c}`, position: "top", fontSize: 10, fill: "var(--foreground)" }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <dl className="grid grid-cols-2 divide-x border-t sm:grid-cols-4">
        <Mini label="Highest" value={String(peak.c)} sub={clock(peak.t)} />
        <Mini label="Lowest" value={String(low)} />
        <Mini label="Average" value={avg.toFixed(1)} sub="dashed line" />
        <Mini label="Readings" value={String(pts.length)} />
      </dl>
    </div>
  );
}

function Mini({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="px-5 py-3">
      <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="font-mono text-xl tabular-nums">{value}</dd>
      {sub && <p className="font-mono text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
