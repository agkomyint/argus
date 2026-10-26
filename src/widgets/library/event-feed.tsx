"use client";

import { Empty } from "@/components/widgets/empty";
import { clock } from "@/lib/product-types";
import { text } from "@/widgets/kit";
import type { WidgetProps } from "@/widgets/schema";

/** The newest things that happened, one line each. The first line is flagged. */
export function EventFeed({ rows, bind, settings, size }: WidgetProps) {
  const items = rows.slice(-(size === "compact" ? 3 : Number(settings.limit))).reverse();
  if (items.length === 0) return <Empty text="Nothing to show yet." />;

  return (
    <ul className={size === "compact" ? "grid h-full content-center gap-1.5 px-4 pt-6 text-xs" : "divide-y border text-sm"}>
      {items.map((r, i) => (
        <li key={`${r.t}-${i}`} className={size === "compact" ? "flex items-center gap-2" : "flex items-center gap-3 px-4 py-2.5"}>
          <span className="size-2 shrink-0" style={{ background: i === 0 ? "var(--destructive)" : "var(--electric)" }} />
          <span className="min-w-0 flex-1 truncate">{text(r, bind.title, r.type)}</span>
          {size === "full" && <span className="shrink-0 font-mono text-xs text-muted-foreground">{clock(r.t)}</span>}
        </li>
      ))}
    </ul>
  );
}
