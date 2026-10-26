import { datasetCsv } from "@/lib/csv";
import { getShared } from "@/lib/explore";
import { loadDatasets } from "@/lib/product-data";

// One dataset of a product on a shared project, as CSV. Public: the owner agreed to share these rows.
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shared = await getShared(slug);
  const q = new URL(request.url).searchParams;
  const product = shared?.products.find((p) => p.id === q.get("product"));
  const type = q.get("type") ?? "";
  if (!shared || !product || !product.observationTypes.includes(type)) return Response.json({ error: "Not found" }, { status: 404 });

  const [d] = await loadDatasets(shared.id, [type], 5000);
  return new Response(datasetCsv(d.rows), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${product.id}-${type}.csv"` },
  });
}
