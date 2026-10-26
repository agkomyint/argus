"use client";

import type { Dataset } from "@/lib/product-types";
import { getProduct } from "@/products";
import { widgetFor } from "@/widgets/resolve";
import { WidgetView } from "@/widgets/use";

/** Small card version of a product's widget. Real rows when the project has them, otherwise a labelled sample. */
export function ProductPreview({ productId, kind, data }: { productId: string; kind: string; data: Dataset[] }) {
  const real = data.some((d) => d.total > 0);
  const use = widgetFor(getProduct(productId) ?? { kind });
  return (
    <div className="relative border bg-muted/30">
      <span className="absolute right-2 top-2 z-10 bg-background px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        {real ? "Your data" : "Sample"}
      </span>
      <div className="h-32">
        <WidgetView use={use} data={data} size="compact" />
      </div>
    </div>
  );
}
