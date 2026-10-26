import { z } from "zod";

/** What a widget draws. Decides which products it can sensibly sit on. */
export const WIDGET_SHAPES = ["number", "series", "share", "ranking", "feed", "grid", "table"] as const;

const key = z.string().regex(/^[a-z][a-zA-Z0-9]*$/, "camelCase key");

/** A slot is a named input: "which field of the data feeds this part of the widget". */
const slotSchema = z.object({
  key,
  label: z.string(),
  hint: z.string(),
  required: z.boolean().default(false),
  /** More than one field can be bound (for example the parts of a split). */
  multiple: z.boolean().default(false),
  /** Field used when a product does not bind this slot. */
  default: z.array(z.string()).default([]),
});

const settingSchema = z.object({
  key,
  label: z.string(),
  kind: z.enum(["text", "number", "select", "toggle"]),
  options: z.array(z.string()).optional(),
  default: z.union([z.string(), z.number(), z.boolean()]),
});

/**
 * A widget manifest declares a reusable visual: what shape of data it takes (slots), what a
 * viewer can tweak (settings), and where it fits. The component lives in the registry.
 */
export const widgetManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "kebab-case id"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "semver"),
  name: z.string(),
  summary: z.string(),
  shape: z.enum(WIDGET_SHAPES),
  slots: z.array(slotSchema),
  settings: z.array(settingSchema),
});

export type WidgetManifestInput = z.input<typeof widgetManifestSchema>;
export type WidgetManifest = z.output<typeof widgetManifestSchema>;
export type WidgetShape = (typeof WIDGET_SHAPES)[number];

export type SettingValue = string | number | boolean;

/** How one data product uses a widget: which widget, which fields feed which slot, which settings. */
export const widgetUseSchema = z.object({
  id: z.string(),
  bind: z.record(z.string(), z.array(z.string())).optional(),
  settings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});
export type WidgetUse = z.infer<typeof widgetUseSchema>;

/** A row flattened for widgets: event time, type, and every payload field at the top level. */
export type FlatRow = { t: number; type: string } & Record<string, unknown>;

export type WidgetProps = {
  rows: FlatRow[];
  /** slot key -> fields, already defaulted from the manifest */
  bind: Record<string, string[]>;
  /** setting key -> value, already defaulted from the manifest */
  settings: Record<string, SettingValue>;
  /** compact is the small card preview, full is the product page */
  size: "compact" | "full";
  /** true when rows are a generated sample, not the project's data */
  sample: boolean;
};
