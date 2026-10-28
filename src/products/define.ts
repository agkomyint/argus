import type { ProductManifest, ProductManifestInput } from "./schema";

/**
 * Fills a product manifest's defaults the way its schema does, without loading zod. The catalog is read in the
 * browser too (lane cards check which lane can feed which product), so it uses this; the tests check that every
 * manifest also passes the schema unchanged.
 */
export function defineProduct(m: ProductManifestInput): ProductManifest {
  return {
    ...m,
    observationTypes: m.observationTypes ?? [],
    params: (m.params ?? []).map((p) => ({ ...p, required: p.required ?? false })),
    time: m.time ?? "event-time",
    crs: m.crs ?? null,
    requiresHumanReview: m.requiresHumanReview ?? false,
  };
}
