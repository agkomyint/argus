import type { WidgetManifest, WidgetManifestInput } from "@/widgets/schema";

/**
 * Fills a widget manifest's defaults the way its schema does, without loading zod. The registry runs in the
 * browser, so it uses this; the tests check that every manifest also passes the schema unchanged.
 */
export function defineWidget(m: WidgetManifestInput): WidgetManifest {
  return { ...m, slots: m.slots.map((s) => ({ ...s, required: s.required ?? false, multiple: s.multiple ?? false, default: s.default ?? [] })) };
}
