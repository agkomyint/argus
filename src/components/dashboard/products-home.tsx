import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { jobs, projectProducts } from "@/db/schema";
import { AddProductDialog } from "@/components/dashboard/add-product-dialog";
import { SourceStrip } from "@/components/dashboard/source-strip";
import { PageHeader } from "@/components/dashboard/page-header";
import { AutoRefresh } from "@/components/dashboard/pipeline-controls";
import { ProductPreview } from "@/components/widgets/product-preview";
import { loadLinked } from "@/lib/product-link";
import { loadDatasets } from "@/lib/product-data";
import { SOURCE_LABEL, sourcesFor } from "@/lib/product-sources";
import { products } from "@/products";
import { CATEGORY_LABEL } from "@/products/schema";

type Project = { id: string; name: string; kind: string };
const when = (t: number | null) => (t ? new Date(t).toISOString().slice(0, 16).replace("T", " ") + "Z" : "no data yet");

/** The main canvas: the data products this project makes, with the data ready to download. Sources are secondary. */
export async function ProductsHome({ project }: { project: Project }) {
  const pid = project.id;
  const [enabledRows, linked, [busy]] = await Promise.all([
    db.select().from(projectProducts).where(eq(projectProducts.projectId, pid)),
    loadLinked(pid),
    db.select({ n: sql<number>`count(*)::int` }).from(jobs).where(sql`${jobs.projectId} = ${pid} and ${jobs.status} in ('queued','running')`),
  ]);
  const supported = products.filter((p) => p.status === "supported");
  const enabledIds = new Set(enabledRows.map((r) => r.productId));
  const mine = supported.filter((p) => enabledIds.has(p.id));
  const more = supported.filter((p) => !enabledIds.has(p.id));
  const data = await Promise.all(mine.map((p) => loadDatasets(pid, p.observationTypes, 200)));

  return (
    <>
      <AutoRefresh active={busy.n > 0} />
      <PageHeader title={project.name} description="Your data products. Open one to see it, link its sources, or download the data as CSV for analysis and AI research.">
        {more.length > 0 && <AddProductDialog items={more.map((p) => ({ id: p.id, name: p.name, summary: p.summary, kind: p.kind, category: CATEGORY_LABEL[p.category], needs: sourcesFor(p.id).map((n) => SOURCE_LABEL[n.kind] + (n.required ? "" : " (optional)")) }))} />}
      </PageHeader>


      {mine.length === 0 ? (
        <div className="border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">No data products yet. Pick what you want to produce, and ARGUS will suggest the data to bring.</p>
        </div>
      ) : (
        <ul className="grid gap-8 lg:grid-cols-2">
          {mine.map((p, i) => {
            const ds = data[i];
            const total = ds.reduce((n, d) => n + d.total, 0);
            const latest = ds.reduce<number | null>((m, d) => (d.latest && (!m || d.latest > m) ? d.latest : m), null);
            const href = `/dashboard/products/${p.id}`;
            return (
              <li key={p.id} className="flex flex-col gap-3 border p-4">
                <Link href={href} className="block hover:opacity-90"><ProductPreview productId={p.id} kind={p.kind} data={ds} /></Link>
                <div>
                  <Link href={href} className="text-lg font-medium hover:underline">{p.name}</Link>
                  <p className="mt-1 text-sm text-muted-foreground">{p.summary}</p>
                  <p className="mt-2 font-mono text-xs text-muted-foreground">{total.toLocaleString()} rows · latest {when(latest)}</p>
                </div>
                <SourceStrip productId={p.id} linked={linked} href={`${href}#sources`} />
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                  {ds.filter((d) => d.total > 0).map((d) => (
                    <a key={d.type} href={`/api/products/${p.id}/export?type=${d.type}`} className="border bg-electric px-3 py-1.5 text-sm font-medium text-background hover:opacity-90">
                      Download CSV{ds.length > 1 ? ` · ${d.type}` : ""}
                    </a>
                  ))}
                  {total === 0 && <span className="text-sm text-muted-foreground">No data to download yet. Link a source above.</span>}
                  <Link href={href} className="ml-auto text-sm text-electric hover:underline">Open →</Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

    </>
  );
}
