"use client";

import { Empty } from "@/components/widgets/empty";
import { clock } from "@/lib/product-types";
import { rowKeys } from "@/widgets/kit";
import type { WidgetProps } from "@/widgets/schema";

const cell = (v: unknown) => (v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** The raw rows, newest first. The fallback widget for any product: nothing is hidden. */
export function RowsTable({ rows, bind, settings, size }: WidgetProps) {
  if (rows.length === 0) return <Empty text="Nothing to show yet." />;
  const cols = bind.columns.length ? bind.columns : [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => k !== "t" && k !== "type").slice(0, 5);
  const shown = rows.slice(-(size === "compact" ? 3 : Number(settings.limit))).reverse();
  const keys = rowKeys(shown);

  return (
    <div className={size === "compact" ? "h-full overflow-hidden px-3 pt-7" : "overflow-x-auto border"}>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="px-2 py-1.5 font-normal">time</th>
            {cols.map((c) => <th key={c} className="px-2 py-1.5 font-normal">{c}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y">
          {shown.map((r, i) => (
            <tr key={keys[i]}>
              <td className="px-2 py-1.5 font-mono text-muted-foreground">{clock(r.t)}</td>
              {cols.map((c) => <td key={c} className="max-w-48 truncate px-2 py-1.5">{cell(r[c])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
