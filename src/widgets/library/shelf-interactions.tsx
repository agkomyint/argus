"use client";

import { Empty } from "@/components/widgets/empty";
import { rowKeys } from "@/widgets/kit";
import type { FlatRow, WidgetProps } from "@/widgets/schema";

const secs = (r: FlatRow, k: string) => `${Math.round(Number(r[k] ?? 0) / 1000)}s`;
const OUTCOME: Record<string, string> = { returned: "Put back", paid: "Paid", carried_out: "Left with it", in_store: "Still inside" };

/** One line per pickup: who was near which item, for how long, what happened, and whether the rule flagged it. */
export function ShelfInteractions({ rows, size }: WidgetProps) {
  const items = rows.filter((r) => r.type === "shelf_interaction");
  const flagged = items.filter((r) => r.flagged === true);
  if (!items.length) return <Empty text="No shelf activity yet. Add a store camera lane and a checkout source." />;

  if (size === "compact") {
    return (
      <div className="grid h-full content-center gap-1 px-4 pt-6">
        <p className="font-mono text-2xl tabular-nums" style={{ color: flagged.length ? "var(--destructive)" : undefined }}>{flagged.length} flagged</p>
        <p className="truncate text-xs text-muted-foreground">{flagged.length ? String(flagged[flagged.length - 1].reason) : `${items.length} pickups, none flagged`}</p>
      </div>
    );
  }
  const keys = rowKeys(items);
  return (
    <div className="border text-sm">
      <p className="border-b px-4 py-2 font-mono text-xs text-muted-foreground">{items.length} pickups · {flagged.length} flagged for review</p>
      <ul className="divide-y">
        {items.map((r, i) => {
          const hot = r.flagged === true;
          return (
            <li key={keys[i]} className="grid gap-1 px-4 py-3 sm:grid-cols-[6rem_1fr_auto] sm:items-center sm:gap-4" style={hot ? { borderLeft: "3px solid var(--destructive)" } : undefined}>
              <span className="font-mono text-xs text-muted-foreground">Person {String(r.person)}</span>
              <span className="min-w-0">
                <span className="font-medium">{String(r.item)}</span>
                <span className="text-muted-foreground"> · {String(r.zone)} · near {secs(r, "dwell_ms")} · held {secs(r, "held_ms")}</span>
                <span className="block text-xs text-muted-foreground">{String(r.reason)}</span>
              </span>
              <span className="font-mono text-xs uppercase tracking-wider" style={{ color: hot ? "var(--destructive)" : undefined }}>{hot ? "Flag" : (OUTCOME[String(r.outcome)] ?? String(r.outcome))}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
