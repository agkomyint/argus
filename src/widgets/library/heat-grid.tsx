"use client";

import { Empty } from "@/components/widgets/empty";
import type { WidgetProps } from "@/widgets/schema";

const COLS = 14;
const ROWS = 8;

/** Where things concentrate: points binned into a grid, darker means more. Fields x and y are 0..1 or any range. */
export function HeatGrid({ rows, bind, size }: WidgetProps) {
  const at = (r: (typeof rows)[number], f?: string) => (f && r[f] !== undefined && r[f] !== "" ? Number(r[f]) : NaN);
  const xs = rows.map((r) => at(r, bind.x[0]));
  const ys = rows.map((r) => at(r, bind.y[0]));
  const ok = rows.map((_, i) => Number.isFinite(xs[i]) && Number.isFinite(ys[i]));
  if (!ok.some(Boolean)) return <Empty text="Nothing to show yet." />;
  const min = (a: number[]) => Math.min(...a.filter((_, i) => ok[i]));
  const max = (a: number[]) => Math.max(...a.filter((_, i) => ok[i]));
  const [x0, x1, y0, y1] = [min(xs), max(xs), min(ys), max(ys)];
  const cells = new Array<number>(COLS * ROWS).fill(0);
  rows.forEach((_, i) => {
    if (!ok[i]) return;
    const cx = Math.min(COLS - 1, Math.floor(((xs[i] - x0) / (x1 - x0 || 1)) * COLS));
    const cy = Math.min(ROWS - 1, Math.floor(((ys[i] - y0) / (y1 - y0 || 1)) * ROWS));
    cells[cy * COLS + cx]++;
  });
  const peak = Math.max(...cells, 1);

  return (
    <div className={size === "compact" ? "h-full p-3 pt-7" : "border p-5"}>
      <div className={size === "compact" ? "grid h-full gap-px" : "grid aspect-[14/8] gap-px"} style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
        {cells.map((n, k) => <div key={k} title={`${n}`} style={{ background: "var(--electric)", opacity: 0.08 + (n / peak) * 0.92 }} />)}
      </div>
    </div>
  );
}
