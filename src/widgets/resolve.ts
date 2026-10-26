import type { Dataset } from "@/lib/product-types";
import type { FlatRow, SettingValue, WidgetManifest, WidgetUse } from "@/widgets/schema";

/** The widget a product gets when its manifest does not name one: chosen by what the product is. */
const DEFAULT_BY_KIND: Record<string, string> = {
  dataset: "volume-bars",
  timeseries: "stat-trend",
  "event-stream": "event-feed",
  alert: "event-feed",
  "spatial-layer": "heat-grid",
};

/** Every product is exactly one widget. This returns its use, explicit or defaulted. */
export function widgetFor(product: { kind: string; widget?: WidgetUse }): WidgetUse {
  return product.widget ?? { id: DEFAULT_BY_KIND[product.kind] ?? "rows-table" };
}

/** Fill every slot and setting the use did not mention from the widget's manifest. */
export function resolveUse(m: WidgetManifest, use: WidgetUse) {
  const bind = Object.fromEntries(m.slots.map((s) => [s.key, use.bind?.[s.key] ?? s.default]));
  const settings = Object.fromEntries(m.settings.map((s) => [s.key, use.settings?.[s.key] ?? s.default])) as Record<string, SettingValue>;
  return { bind, settings };
}

export const flatten = (data: Dataset[]): FlatRow[] =>
  data.flatMap((d) => d.rows).sort((a, b) => a.t - b.t).map((r) => ({ ...r.payload, t: r.t, type: r.type }));
