import type { ComponentType } from "react";
import { CategoryBars } from "@/widgets/library/category-bars";
import { EventFeed } from "@/widgets/library/event-feed";
import { HeatGrid } from "@/widgets/library/heat-grid";
import { RowsTable } from "@/widgets/library/rows-table";
import { StackedShare } from "@/widgets/library/stacked-share";
import { StatTrend } from "@/widgets/library/stat-trend";
import { VolumeBars } from "@/widgets/library/volume-bars";
import { sampleTimes, T0, wave } from "@/widgets/kit";
import { widgetManifestSchema, type FlatRow, type WidgetManifest, type WidgetManifestInput, type WidgetProps } from "@/widgets/schema";

export type WidgetEntry = {
  manifest: WidgetManifest;
  Component: ComponentType<WidgetProps>;
  /** Deterministic rows used for previews and the design page, shaped for the given binding. */
  sample: (bind: Record<string, string[]>) => FlatRow[];
};

/** Pseudo-random in [0,1), seeded so samples never drift between server and client. */
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

// To plug in a widget: write its component in ./library, describe it here, add it to REGISTRY.
const statTrend: WidgetManifestInput = {
  id: "stat-trend",
  version: "1.0.0",
  name: "Stat and trend",
  summary: "One number that matters, the line it moves along, and its busiest moment.",
  shape: "number",
  slots: [{ key: "value", label: "Value", hint: "Numeric field to track over time", required: true, default: ["count"] }],
  settings: [
    { key: "unit", label: "Unit", kind: "text", default: "readings" },
    { key: "caption", label: "Caption", kind: "text", default: "Latest reading" },
  ],
};

const stackedShare: WidgetManifestInput = {
  id: "stacked-share",
  version: "1.0.0",
  name: "Stacked share",
  summary: "How a whole splits into parts, overall as a ring and over time as 100% bars.",
  shape: "share",
  slots: [{ key: "parts", label: "Parts", hint: "Numeric fields that add up to the whole", required: true, multiple: true, default: ["a", "b"] }],
  settings: [
    { key: "labels", label: "Part labels", kind: "text", default: "" },
    { key: "totalLabel", label: "Total label", kind: "text", default: "in total" },
  ],
};

const volumeBars: WidgetManifestInput = {
  id: "volume-bars",
  version: "1.0.0",
  name: "Volume bars",
  summary: "How much data arrived, per day or per hour. Works on any product.",
  shape: "series",
  slots: [],
  settings: [{ key: "caption", label: "Caption", kind: "text", default: "Rows" }],
};

const categoryBars: WidgetManifestInput = {
  id: "category-bars",
  version: "1.0.0",
  name: "Category bars",
  summary: "Which label is biggest: rows (or a summed value) per category, ranked.",
  shape: "ranking",
  slots: [
    { key: "category", label: "Category", hint: "Text field to group by", required: true, default: ["class"] },
    { key: "value", label: "Weight", hint: "Optional numeric field to sum instead of counting rows", default: [] },
  ],
  settings: [
    { key: "top", label: "Show top", kind: "number", default: 6 },
    { key: "sumValue", label: "Sum the weight field", kind: "toggle", default: false },
  ],
};

const eventFeed: WidgetManifestInput = {
  id: "event-feed",
  version: "1.0.0",
  name: "Event feed",
  summary: "The newest things that happened, one line each, newest flagged.",
  shape: "feed",
  slots: [{ key: "title", label: "Title", hint: "Text field to show on each line", required: true, default: ["title"] }],
  settings: [{ key: "limit", label: "Lines", kind: "number", default: 8 }],
};

const heatGrid: WidgetManifestInput = {
  id: "heat-grid",
  version: "1.0.0",
  name: "Heat grid",
  summary: "Where things concentrate: points binned on a grid, darker means more.",
  shape: "grid",
  slots: [
    { key: "x", label: "X", hint: "Numeric field for the horizontal position", required: true, default: ["x"] },
    { key: "y", label: "Y", hint: "Numeric field for the vertical position", required: true, default: ["y"] },
  ],
  settings: [],
};

const rowsTable: WidgetManifestInput = {
  id: "rows-table",
  version: "1.0.0",
  name: "Rows table",
  summary: "The raw rows, newest first. The fallback for any product.",
  shape: "table",
  slots: [{ key: "columns", label: "Columns", hint: "Fields to show. Empty shows the first five.", multiple: true, default: [] }],
  settings: [{ key: "limit", label: "Rows", kind: "number", default: 10 }],
};

const withTimes = (n: number, step: number, make: (i: number) => Record<string, unknown>): FlatRow[] =>
  sampleTimes(n, step).map((t, i) => ({ t, type: "sample", ...make(i) }));

const entries: WidgetEntry[] = [
  { manifest: widgetManifestSchema.parse(statTrend), Component: StatTrend, sample: (b) => { const w = wave(30, 6, 3); return withTimes(30, 10_000, (i) => ({ [b.value[0] ?? "count"]: w[i] })); } },
  {
    manifest: widgetManifestSchema.parse(stackedShare),
    Component: StackedShare,
    sample: (b) => {
      const keys = b.parts.length ? b.parts : ["a", "b"];
      const w = wave(24, 3, 1.5);
      return withTimes(24, 10_000, (i) => Object.fromEntries(keys.map((k, j) => [k, j === 0 ? w[i] : Math.max(0, 5 - w[i] + ((i + j) % 3)) * (j === 2 ? 0.2 : 1) | 0])));
    },
  },
  {
    manifest: widgetManifestSchema.parse(volumeBars),
    Component: VolumeBars,
    sample: () => wave(14, 5, 3).flatMap((n, d) => Array.from({ length: n }, () => ({ t: T0 + d * 86_400_000, type: "sample" }) as FlatRow)),
  },
  {
    manifest: widgetManifestSchema.parse(categoryBars),
    Component: CategoryBars,
    sample: (b) => {
      const field = b.category[0] ?? "class";
      const mix = [["car", 9], ["truck", 4], ["person", 3], ["bus", 2], ["bike", 1]] as const;
      return mix.flatMap(([k, n]) => Array.from({ length: n }, (_, i) => ({ t: T0 + i * 1000, type: "sample", [field]: k }) as FlatRow));
    },
  },
  {
    manifest: widgetManifestSchema.parse(eventFeed),
    Component: EventFeed,
    sample: (b) => withTimes(3, 60_000, (i) => ({ [b.title[0] ?? "title"]: ["Wrong-way entry, ramp B", "Near-miss at crossing 14", "Hard braking cluster at Main St"][i] })),
  },
  {
    manifest: widgetManifestSchema.parse(heatGrid),
    Component: HeatGrid,
    sample: (b) => {
      const r = rng(7);
      const [fx, fy] = [b.x[0] ?? "x", b.y[0] ?? "y"];
      return Array.from({ length: 220 }, (_, i) => {
        const hot = i % 3 === 0;
        const g = () => (r() + r() + r()) / 3;
        return { t: T0 + i * 1000, type: "sample", [fx]: hot ? 0.25 + g() * 0.2 : 0.62 + g() * 0.3, [fy]: hot ? 0.55 + g() * 0.3 : 0.2 + g() * 0.3 } as FlatRow;
      });
    },
  },
  {
    manifest: widgetManifestSchema.parse(rowsTable),
    Component: RowsTable,
    sample: () => withTimes(4, 30_000, (i) => ({ label: ["car", "truck", "car", "bus"][i], confidence: [0.94, 0.88, 0.91, 0.79][i] })),
  },
];

const byId = new Map(entries.map((e) => [e.manifest.id, e]));
if (byId.size !== entries.length) throw new Error("Duplicate widget id in the registry");

export const widgets: readonly WidgetEntry[] = entries;
export const getWidget = (id: string) => byId.get(id);
