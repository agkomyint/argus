import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReplayPlayer } from "@/components/dashboard/replay-player";
import { SiteFooter } from "@/components/landing/cta-footer";
import { Widget } from "@/components/widgets";
import { buttonVariants } from "@/components/ui/button";
import { getShared } from "@/lib/explore";
import { loadDatasets } from "@/lib/product-data";
import { kindLabel } from "@/lib/projects";
import { loadReplay } from "@/lib/replay";

export const metadata: Metadata = { title: "Shared project — ARGUS" };

const label = "font-mono text-[10px] uppercase tracking-wider text-muted-foreground";
const day = (d: Date) => d.toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });

export default function SharedProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <>
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-28 sm:px-6">
        <Link href="/explore" className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />Explore
        </Link>
        <Suspense fallback={<div aria-busy="true" className="h-96 animate-pulse bg-muted" />}>
          <Body params={params} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Body({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getShared(slug);
  if (!p) notFound();
  const [replay, datasets] = await Promise.all([loadReplay(p.id, "public"), Promise.all(p.products.map((prod) => loadDatasets(p.id, prod.observationTypes)))]);
  const rows = datasets.flat().reduce((a, d) => a + d.total, 0);
  // Products with no rows yet would only show an owner-facing empty state; list them by name instead.
  const made = p.products.flatMap((prod, i) => (datasets[i].some((d) => d.total > 0) ? [{ prod, data: datasets[i] }] : []));
  const pending = p.products.filter((prod) => !made.some((m) => m.prod.id === prod.id));
  const sources = replay?.nodes.filter((n) => n.col === 0).length ?? 0;
  const agents = replay?.nodes.filter((n) => n.col === 1 || n.col === 2).length ?? 0;
  const stats = [
    ["Data products", p.products.length],
    ["Rows made", rows.toLocaleString("en-US")],
    ["Sources", sources],
    ["Agents", agents],
  ] as const;

  return (
    <>
      <p className={label}>{kindLabel(p.kind)} · shared by {p.owner}</p>
      <h1 className="mt-2 text-balance text-4xl font-medium tracking-tight sm:text-5xl">{p.name}</h1>
      <p className="mt-3 text-muted-foreground">Running since {day(p.createdAt)}. Public since {day(p.sharedAt!)}.</p>

      <dl className="mt-8 grid grid-cols-2 divide-x border-y sm:grid-cols-4">
        {stats.map(([k, v]) => (
          <div key={k} className="px-4 py-4 first:pl-0">
            <dt className={label}>{k}</dt>
            <dd className="mt-1 text-2xl font-medium tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-14">
        <h2 className="text-2xl font-medium tracking-tight">Data products</h2>
        {made.length === 0 ? (
          <p className="mt-4 border border-dashed p-8 text-center text-sm text-muted-foreground">No data made yet. The replay below shows how far it has got.</p>
        ) : (
          <div className="mt-6 space-y-10">
            {made.map(({ prod, data }) => (
              <article key={prod.id} className="border">
                <header className="flex flex-wrap items-baseline justify-between gap-3 border-b p-4">
                  <div>
                    <h3 className="font-medium">{prod.name}</h3>
                    <p className="text-sm text-muted-foreground">{prod.summary}</p>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">{data.reduce((a, d) => a + d.total, 0).toLocaleString("en-US")} rows</span>
                </header>
                <div className="p-4">
                  <Widget productId={prod.id} data={data} />
                </div>
                <footer className="flex flex-wrap gap-x-5 gap-y-1 border-t px-4 py-2.5 text-sm">
                  <span className={label}>Download</span>
                  {data.filter((d) => d.total > 0).map((d) => (
                    <a key={d.type} href={`/api/explore/${slug}/export?product=${prod.id}&type=${d.type}`} className="font-mono text-xs text-electric underline-offset-4 hover:underline">
                      {d.type}.csv
                    </a>
                  ))}
                </footer>
              </article>
            ))}
          </div>
        )}
        {pending.length > 0 && <p className="mt-4 text-sm text-muted-foreground">Still waiting for data: {pending.map((x) => x.name).join(", ")}.</p>}
      </section>

      {replay && (
        <section className="mt-16">
          <h2 className="text-2xl font-medium tracking-tight">Replay</h2>
          <p className="mb-6 mt-2 max-w-2xl text-sm text-muted-foreground">How this project made its data, from the first day until now: sources on the left, agents in the middle, data products on the right. Press play, or drag to any moment.</p>
          <ReplayPlayer data={replay} />
        </section>
      )}

      <section className="mt-16 flex flex-wrap items-center justify-between gap-4 border p-6">
        <div>
          <p className="font-medium">Make your own</p>
          <p className="text-sm text-muted-foreground">Pick the data products you want, add a source, and ARGUS sets up the agents.</p>
        </div>
        <Link href="/projects" className={buttonVariants()}>Start a project</Link>
      </section>
    </>
  );
}
