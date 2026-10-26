import { getProduct } from "@/products";
import type { Dataset } from "@/lib/product-types";
import { widgetFor } from "@/widgets/resolve";
import { WidgetView } from "@/widgets/use";

/** A product is datasets plus one widget. The widget comes from the product's manifest (or its kind) and the registry in src/widgets. */
export function Widget({ productId, data }: { productId: string; data: Dataset[] }) {
  const product = getProduct(productId);
  return <WidgetView use={widgetFor(product ?? { kind: "dataset" })} data={data} size="full" />;
}
