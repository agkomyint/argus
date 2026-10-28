"use client";

import { Empty } from "@/components/widgets/empty";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FILL, TICK, TOOLTIP } from "@/components/widgets/chart-style";
import { clock } from "@/lib/product-types";
import { ANIM, HIDE, PALETTE, val } from "@/widgets/kit";
import type { WidgetProps } from "@/widgets/schema";

/** How a whole divides into parts: a ring for the total, 100% bars for how it moved. */
export function StackedShare({ rows, bind, settings, size }: WidgetProps) {
  const labels = String(settings.labels).split(",").map((s) => s.trim());
  const parts = bind.parts.map((key, i) => ({ key, label: labels[i] || key, color: PALETTE[i % PALETTE.length] }));
  const frames = rows.map((r) => ({ t: r.t, ...Object.fromEntries(parts.map((p) => [p.key, val(r, [p.key], 0)])) })) as ({ t: number } & Record<string, number>)[];
  const sums = parts.map((p) => ({ ...p, n: frames.reduce((n, f) => n + f[p.key], 0) }));
  const total = sums.reduce((n, s) => n + s.n, 0);
  if (frames.length === 0 || total === 0) return <Empty text="Nothing to show yet." />;

  if (size === "compact") {
    return (
      <ResponsiveContainer {...FILL}>
        <BarChart data={frames.slice(-40)} stackOffset="expand" barCategoryGap={1} margin={{ top: 28, right: 6, bottom: 6, left: 6 }}>
          <XAxis dataKey="t" {...HIDE} />
          <YAxis {...HIDE} />
          {parts.map((p) => <Bar key={p.key} dataKey={p.key} stackId="a" fill={p.color} {...ANIM} />)}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  const recent = frames.slice(-60);
  return (
    <div className="grid gap-px border bg-border md:grid-cols-[16rem_1fr]">
      <div className="flex flex-col items-center bg-background p-5">
        <div className="relative size-44">
          <ResponsiveContainer {...FILL}>
            <PieChart>
              <Pie data={sums} dataKey="n" nameKey="label" innerRadius="68%" outerRadius="100%" stroke="var(--background)" strokeWidth={2} {...ANIM}>
                {sums.map((s) => <Cell key={s.key} fill={s.color} />)}
              </Pie>
              <Tooltip {...TOOLTIP} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="font-mono text-2xl tabular-nums">{total}</p>
              <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{String(settings.totalLabel)}</p>
            </div>
          </div>
        </div>
        <ul className="mt-4 w-full space-y-1.5">
          {sums.map((s) => (
            <li key={s.key} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2"><span className="size-2.5" style={{ background: s.color }} />{s.label}</span>
              <span className="font-mono tabular-nums">{Math.round((s.n / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="bg-background p-5">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Split per reading, latest {recent.length}</p>
        <div className="mt-3 h-44 min-w-0">
          <ResponsiveContainer {...FILL}>
            <BarChart data={recent} stackOffset="expand" barCategoryGap={1} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
              <XAxis dataKey="t" tickFormatter={clock} tick={TICK} axisLine={false} tickLine={false} minTickGap={48} />
              <YAxis tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`} tick={TICK} axisLine={false} tickLine={false} />
              <Tooltip {...TOOLTIP} labelFormatter={(t) => clock(Number(t))} cursor={{ fill: "var(--accent)", opacity: 0.4 }} />
              {parts.map((p) => <Bar key={p.key} dataKey={p.key} name={p.label} stackId="a" fill={p.color} {...ANIM} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
