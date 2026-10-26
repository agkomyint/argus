import { productManifestSchema, type ProductCategory, type ProductManifest, type ProductStatus } from "./schema";
import { roadmap } from "./manifests/roadmap";
import { attributeBreakdown, densityHeatmap, objectDetectionDataset, peopleCount, roadSafetyEventFeed, vehicleTrafficDashboard } from "./manifests/supported";

export * from "./schema";

// To add a product: write a manifest and add it here. Everything else (catalog, detail
// pages, planner validation) reads from this list.
const raw = [objectDetectionDataset, densityHeatmap, vehicleTrafficDashboard, roadSafetyEventFeed, peopleCount, attributeBreakdown, ...roadmap];

function load(): ProductManifest[] {
  const products = raw.map((m) => productManifestSchema.parse(m));

  const ids = new Set<string>();
  const numbers = new Set<number>();
  for (const p of products) {
    if (numbers.has(p.no)) throw new Error(`Duplicate catalog number: ${p.no}`);
    numbers.add(p.no);
    if (ids.has(p.id)) throw new Error(`Duplicate product id: ${p.id}`);
    ids.add(p.id);
  }
  for (const p of products) {
    for (const dep of p.inputs) {
      if (!ids.has(dep)) throw new Error(`${p.id} depends on unknown product ${dep}`);
    }
    // A supported product must not rest on something we do not support yet.
    if (p.status === "supported") {
      for (const dep of p.inputs) {
        if (products.find((x) => x.id === dep)?.status !== "supported") {
          throw new Error(`Supported product ${p.id} depends on non-supported ${dep}`);
        }
      }
    }
  }
  return products.sort((a, b) => a.no - b.no);
}

export const products: readonly ProductManifest[] = load();

export const STATUS_ORDER: readonly ProductStatus[] = ["supported", "planned", "research"];

export function getProduct(id: string): ProductManifest | undefined {
  return products.find((p) => p.id === id);
}

export function productsByStatus(status: ProductStatus): ProductManifest[] {
  return products.filter((p) => p.status === status);
}

/** Products that are computed from the given product. */
export function dependentsOf(id: string): ProductManifest[] {
  return products.filter((p) => p.inputs.includes(id));
}

export function productsByCategory(category: ProductCategory): ProductManifest[] {
  return products.filter((p) => p.category === category);
}
