import { SOURCE_LABEL, sourcesFor } from "@/lib/product-sources";
import { products } from "@/products";

/** Supported products as the New project dialog lists them. DB-free. */
export const pickableProducts = () =>
  products
    .filter((p) => p.status === "supported")
    .map((p) => ({ id: p.id, name: p.name, summary: p.summary, kind: p.kind, needs: sourcesFor(p.id).filter((n) => n.required).map((n) => SOURCE_LABEL[n.kind].toLowerCase()) }));
