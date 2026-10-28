import { toggleProjectProduct } from "@/app/product-actions";
import { enabledRows, typeCounts } from "@/lib/project-reads";
import { SOURCE_LABEL, sourcesFor } from "@/lib/product-sources";
import { getProduct, productsByStatus } from "@/products";
import { ProductPicker } from "./product-picker";

/** The studio's Products window: every supported product, which are on, and what data each already has. */
export async function ProductManager({ projectId }: { projectId: string }) {
  const [mine, counts] = await Promise.all([enabledRows(projectId), typeCounts(projectId)]);
  const on = new Set(mine.map((r) => r.productId));
  const have = new Map(counts.map((c) => [c.type, c.n]));

  const items = productsByStatus("supported").map((p) => ({
    id: p.id,
    name: p.name,
    summary: p.summary,
    level: p.level,
    on: on.has(p.id),
    ready: p.observationTypes.reduce((a, t) => a + (have.get(t) ?? 0), 0),
    needs: sourcesFor(p.id).filter((n) => n.required).map((n) => SOURCE_LABEL[n.kind].toLowerCase()),
    from: p.inputs.map((id) => getProduct(id)?.name ?? id),
    locates: p.observationTypes.includes("object_mask"),
  }));

  return <ProductPicker items={items} onToggle={toggleProjectProduct.bind(null, projectId)} />;
}
