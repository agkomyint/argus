"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TICK, TOOLTIP } from "@/components/widgets/chart-style";
import type { ChartOut, FlowOutput, NodeTrace } from "@/lib/flow/engine";

export function FlowResults({ trace, output, at }: { trace: NodeTrace[]; output: FlowOutput; at: string }) {
  return (
    <div className="space-y-8">
      <p className="font-mono text-[11px] text-muted-foreground">Last run {at}</p>

      {output.charts.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          {output.charts.map((c) => <ChartCard key={c.nodeId} chart={c} />)}
        </div>
      )}

      {output.published.length > 0 && (
        <p className="border-l-2 border-signal pl-3 text-sm">
          Published {output.published.map((p) => `${p.count} rows as “${p.type}”`).join(", ")}. They now appear in Observations, and this flow&apos;s output is available at <code className="font-mono text-xs">/api/flows/&lt;id&gt;/output</code>.
        </p>
      )}

      <div>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">What each node did</p>
        <ol className="border">
          {trace.map((t) => (
            <li key={t.id} className="border-b p-3 last:border-b-0">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="text-sm font-medium">{t.label}</span>
                <span className="font-mono text-xs text-muted-foreground">{t.inCount} in → {t.outCount} out · {t.ms}ms</span>
              </div>
              <p className={t.error ? "mt-1 text-sm text-destructive" : "mt-1 text-sm text-muted-foreground"}>{t.error ?? t.note}</p>
              {t.sample.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer font-mono text-[11px] text-muted-foreground hover:text-foreground">Sample rows</summary>
                  <pre className="mt-1 max-h-48 overflow-auto bg-muted p-3 text-[11px] leading-relaxed">{JSON.stringify(t.sample, null, 2)}</pre>
                </details>
              )}
            </li>
          ))}
        </ol>
      </div>

      {output.tables.filter((t) => t.rows.length > 0).map((t) => (
        <div key={t.nodeId}>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Final rows · {t.label} · {t.rows.length}</p>
          <Table rows={t.rows} />
        </div>
      ))}
    </div>
  );
}

function ChartCard({ chart }: { chart: ChartOut }) {
  const data = chart.data.map((r) => ({ x: String(r[chart.x] ?? ""), y: Number(r[chart.y] ?? 0) || 0 }));
  if (chart.kind === "number") {
    const v = data.length === 1 ? data[0].y : data.reduce((a, b) => a + b.y, 0);
    return (
      <div className="border p-5">
        <p className="font-mono text-4xl font-medium tabular-nums">{Math.round(v * 100) / 100}</p>
        <p className="mt-1 text-xs text-muted-foreground">{data.length === 1 ? chart.y : `sum of ${chart.y}`} · {data.length} rows</p>
      </div>
    );
  }
  if (!data.length) return <div className="border p-5 text-sm text-muted-foreground">Nothing reached this chart.</div>;
  const Chart = chart.kind === "line" ? LineChart : BarChart;
  return (
    <div className="border p-4">
      <ResponsiveContainer width="100%" height={220}>
        <Chart data={data}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="x" tick={TICK} tickLine={false} axisLine={false} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} width={36} />
          <Tooltip {...TOOLTIP} />
          {chart.kind === "line" ? <Line dataKey="y" stroke="var(--electric)" strokeWidth={2} dot={false} isAnimationActive={false} /> : <Bar dataKey="y" fill="var(--electric)" isAnimationActive={false} />}
        </Chart>
      </ResponsiveContainer>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{chart.y} by {chart.x}</p>
    </div>
  );
}

function Table({ rows }: { rows: Record<string, unknown>[] }) {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => k !== "id").slice(0, 8);
  const show = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
  return (
    <div className="max-h-80 overflow-auto border">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-muted"><tr>{keys.map((k) => <th key={k} className="px-3 py-2 font-mono font-normal text-muted-foreground">{k}</th>)}</tr></thead>
        <tbody>
          {rows.slice(0, 50).map((r, i) => (
            <tr key={i} className="border-t">{keys.map((k) => <td key={k} className="max-w-64 truncate px-3 py-1.5">{show(r[k])}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
