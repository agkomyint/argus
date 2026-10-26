import { datasetCsv } from "@/lib/csv";
import { loadDatasets } from "@/lib/product-data";
import { getWorkspace } from "@/lib/session";
import { getProduct } from "@/products";

// One dataset of a product as CSV, for the signed-in user's current project.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ws = await getWorkspace();
  if (!ws) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const product = getProduct(id);
  const type = new URL(request.url).searchParams.get("type") ?? "";
  if (!product || product.status !== "supported" || !product.observationTypes.includes(type)) {
    return Response.json({ error: "Unknown dataset" }, { status: 404 });
  }

  const [d] = await loadDatasets(ws.project.id, [type], 5000);
  return new Response(datasetCsv(d.rows), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${id}-${type}.csv"` },
  });
}
