"use client";

import { Empty } from "@/components/widgets/empty";
import { text, val } from "@/widgets/kit";
import type { WidgetProps } from "@/widgets/schema";

/** Which category is biggest: rows (or a summed value) per label, as ranked bars. */
export function CategoryBars({ rows, bind, settings, size }: WidgetProps) {
  const sum = Boolean(settings.sumValue);
  const tally = new Map<string, number>();
  for (const r of rows) {
    const k = text(r, bind.category, "other");
    tally.set(k, (tally.get(k) ?? 0) + (sum ? val(r, bind.value, 1) : 1));
  }
  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, size === "compact" ? 4 : Number(settings.top));
  if (ranked.length === 0) return <Empty text="Nothing to show yet." />;
  const max = ranked[0][1];
  const total = [...tally.values()].reduce((a, b) => a + b, 0);

  return (
    <ul className={size === "compact" ? "grid h-full content-center gap-1.5 px-4 pt-6" : "grid gap-2 border p-5"}>
      {ranked.map(([k, n]) => (
        <li key={k} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 text-xs">
          <span className="truncate">{k}</span>
          <span className="h-2 bg-muted"><span className="block h-full bg-electric transition-[width] duration-500 ease-out" style={{ width: `${(n / max) * 100}%` }} /></span>
          <span className="font-mono tabular-nums text-muted-foreground">{size === "compact" ? n : `${n} · ${Math.round((n / total) * 100)}%`}</span>
        </li>
      ))}
    </ul>
  );
}
