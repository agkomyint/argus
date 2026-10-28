"use client";

import { Empty } from "@/components/widgets/empty";
import { moment } from "@/widgets/kit";
import type { FlatRow, WidgetProps } from "@/widgets/schema";

const COLS = 14;
const ROWS = 8;

const cell = (n: number, peak: number) => ({ background: "var(--electric)", opacity: 0.08 + (n / peak) * 0.92 });

/**
 * Where things concentrate: points binned into a grid, darker means more. Fields x and y are 0..1 or any range.
 * Rows without a position (most video detections) fall back to when × what: one column per moment, one row per kind.
 */
export function HeatGrid({ rows, bind, size }: WidgetProps) {
  const at = (r: FlatRow, f?: string) => (f && r[f] !== undefined && r[f] !== "" ? Number(r[f]) : NaN);
  const xs = rows.map((r) => at(r, bind.x[0]));
  const ys = rows.map((r) => at(r, bind.y[0]));
  const ok = rows.map((_, i) => Number.isFinite(xs[i]) && Number.isFinite(ys[i]));
  if (!ok.some(Boolean)) return <WhenWhat rows={rows} size={size} />;
  const min = (a: number[]) => Math.min(...a.filter((_, i) => ok[i]));
  const max = (a: number[]) => Math.max(...a.filter((_, i) => ok[i]));
  // Shares of the frame (0..1) keep the frame's own edges, so a corner stays a corner. Any other range is fitted.
  const unit = [...xs, ...ys].every((v, i) => !ok[i % rows.length] || (v >= 0 && v <= 1));
  const [x0, x1, y0, y1] = unit ? [0, 1, 0, 1] : [min(xs), max(xs), min(ys), max(ys)];
  const cells = new Array<number>(COLS * ROWS).fill(0);
  rows.forEach((_, i) => {
    if (!ok[i]) return;
    const cx = Math.min(COLS - 1, Math.floor(((xs[i] - x0) / (x1 - x0 || 1)) * COLS));
    const cy = Math.min(ROWS - 1, Math.floor(((ys[i] - y0) / (y1 - y0 || 1)) * ROWS));
    cells[cy * COLS + cx]++;
  });
  const peak = Math.max(...cells, 1);

  return (
    <div className={size === "compact" ? "h-full p-3 pt-7" : "h-full border p-5"}>
      <div className={size === "compact" ? "grid h-full gap-px" : "grid aspect-[14/8] max-h-full gap-px"} style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
        {cells.map((n, k) => <div key={k} title={`${n}`} className="transition-opacity duration-500" style={cell(n, peak)} />)}
      </div>
    </div>
  );
}

function WhenWhat({ rows, size }: Pick<WidgetProps, "rows" | "size">) {
  const kindOf = (r: FlatRow) => String(r.label ?? r.object_class ?? r.type ?? "other").toLowerCase();
  const kinds = [...rows.reduce((m, r) => m.set(kindOf(r), (m.get(kindOf(r)) ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]).slice(0, ROWS).map(([k]) => k);
  const times = [...new Set(rows.map(moment))].slice(-30);
  if (kinds.length === 0 || times.length === 0) return <Empty text="Nothing to show yet." />;
  const count = new Map<string, number>();
  for (const r of rows) count.set(`${kindOf(r)}|${moment(r)}`, (count.get(`${kindOf(r)}|${moment(r)}`) ?? 0) + 1);
  const peak = Math.max(1, ...count.values());
  const grid = { gridTemplateColumns: `repeat(${times.length}, minmax(0, 1fr))` };

  if (size === "compact") {
    return (
      <div className="grid h-full gap-px p-3 pt-7" style={grid}>
        {kinds.flatMap((k) => times.map((m) => <div key={`${k}${m}`} style={cell(count.get(`${k}|${m}`) ?? 0, peak)} />))}
      </div>
    );
  }

  return (
    <div className="@container flex h-full flex-col border p-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">When each kind was seen · no positions recorded</p>
      <div className="mt-3 grid min-h-0 flex-1 grid-cols-[minmax(0,5rem)_1fr] gap-x-2 @md:grid-cols-[minmax(0,7rem)_1fr]">
        <div className="grid gap-px" style={{ gridTemplateRows: `repeat(${kinds.length}, minmax(0, 1fr))` }}>
          {kinds.map((k) => <span key={k} className="flex items-center truncate text-[11px] capitalize">{k}</span>)}
        </div>
        <div className="grid gap-px" style={{ ...grid, gridTemplateRows: `repeat(${kinds.length}, minmax(0, 1fr))` }}>
          {kinds.flatMap((k) => times.map((m) => {
            const n = count.get(`${k}|${m}`) ?? 0;
            return <div key={`${k}${m}`} title={`${k} at ${m}: ${n}`} className="min-h-3 transition-opacity duration-500" style={cell(n, peak)} />;
          }))}
        </div>
      </div>
      <div className="mt-1 flex justify-between pl-[calc(5rem+0.5rem)] font-mono text-[9px] text-muted-foreground @md:pl-[calc(7rem+0.5rem)]">
        <span>{times[0]}</span>{times.length > 1 && <span>{times[times.length - 1]}</span>}
      </div>
    </div>
  );
}
