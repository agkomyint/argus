"use client";

import { Empty } from "@/components/widgets/empty";
import type { Dataset } from "@/lib/product-types";
import { getWidget } from "@/widgets/registry";
import { flatten, resolveUse } from "@/widgets/resolve";
import type { WidgetUse } from "@/widgets/schema";

/**
 * Renders one widget for one product. With no rows it shows a labelled generated sample at the
 * compact size (so a card is never blank) and a plain empty state at full size.
 */
export function WidgetView({ use, data, size, showSample = false }: { use: WidgetUse; data: Dataset[]; size: "compact" | "full"; showSample?: boolean }) {
  const entry = getWidget(use.id) ?? getWidget("rows-table")!;
  const { bind, settings } = resolveUse(entry.manifest, use);
  const real = flatten(data);
  const sample = real.length === 0;
  const rows = sample ? entry.sample(bind) : real;
  if (sample && size === "full" && !showSample) return <Empty text="No data yet. Link a source and rows will show up here." />;
  const C = entry.Component;
  return <C rows={rows} bind={bind} settings={settings} size={size} sample={sample} />;
}
