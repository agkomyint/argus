import { datasetCsv } from "@/lib/csv";
import { productsOf } from "@/lib/explore";
import { loadDatasets } from "@/lib/product-data";
import { getAccount } from "@/lib/session";

// One dataset of a product on one of the owner's projects, as CSV. Same shape as the public export.
export async function GET(request: Request, ctx: RouteContext<"/api/studio/[id]/export">) {
  const [{ id }, account] = await Promise.all([ctx.params, getAccount()]);
  if (!account?.projects.some((p) => p.id === id)) return Response.json({ error: "Not found" }, { status: 404 });
  const q = new URL(request.url).searchParams;
  const product = (await productsOf([id])).get(id)?.find((p) => p.id === q.get("product"));
  const type = q.get("type") ?? "";
  if (!product || !product.observationTypes.includes(type)) return Response.json({ error: "Not found" }, { status: 404 });

  const [d] = await loadDatasets(id, [type], 5000);
  return new Response(datasetCsv(d.rows), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${product.id}-${type}.csv"` },
  });
}
