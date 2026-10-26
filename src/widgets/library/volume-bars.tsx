"use client";

import { Empty } from "@/components/widgets/empty";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FILL, TICK, TOOLTIP } from "@/components/widgets/chart-style";
import { HIDE } from "@/widgets/kit";
import type { WidgetProps } from "@/widgets/schema";

/** How much data arrived over time: rows per day (or per hour when it is all one day). */
export function VolumeBars({ rows, settings, size }: WidgetProps) {
  if (rows.length === 0) return <Empty text="Nothing to show yet." />;
  const span = rows[rows.length - 1].t - rows[0].t;
  const hourly = span < 2 * 86_400_000;
  const buckets = new Map<string, number>();
  for (const r of rows) {
    const k = new Date(r.t).toISOString().slice(0, hourly ? 13 : 10);
    buckets.set(k, (buckets.get(k) ?? 0) + 1);
  }
  const bars = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-30).map(([k, n]) => ({ k, n }));

  if (size === "compact") {
    return (
      <ResponsiveContainer {...FILL}>
        <BarChart data={bars} barCategoryGap={2} margin={{ top: 28, right: 6, bottom: 6, left: 6 }}>
          <XAxis dataKey="k" {...HIDE} />
          <YAxis {...HIDE} />
          <Bar dataKey="n" fill="var(--electric)" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <div className="border bg-background p-5">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{String(settings.caption)}</p>
      <p className="mt-1 font-mono text-4xl tabular-nums">{rows.length}</p>
      <div className="mt-4 h-40 min-w-0">
        <ResponsiveContainer {...FILL}>
          <BarChart data={bars} margin={{ top: 4, right: 0, bottom: 0, left: -20 }}>
            <XAxis dataKey="k" tick={TICK} axisLine={false} tickLine={false} minTickGap={32} tickFormatter={(v: string) => v.slice(hourly ? 11 : 5)} />
            <YAxis allowDecimals={false} tick={TICK} axisLine={false} tickLine={false} />
            <Tooltip {...TOOLTIP} cursor={{ fill: "var(--accent)", opacity: 0.4 }} formatter={(v) => [String(v), "rows"]} />
            <Bar dataKey="n" fill="var(--electric)" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
