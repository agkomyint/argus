import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { KIND_META, KindBadge, LevelBadge, MetaBadge, StatusBadge } from "@/components/products/badges";
import { SiteFooter } from "@/components/landing/cta-footer";
import { Suspense } from "react";
import { CATEGORY_LABEL, dependentsOf, getProduct, products } from "@/products";

export function generateStaticParams() {
  return products.map((p) => ({ id: p.id }));
}

export async function generateMetadata(props: PageProps<"/products/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const product = getProduct(id);
  return product ? { title: `${product.name} — ARGUS`, description: product.summary } : {};
}

export default function ProductPage(props: PageProps<"/products/[id]">) {
  return (
    <>
      <Suspense fallback={<main className="mx-auto min-h-screen max-w-4xl px-4 pt-28 sm:px-6" />}>
        <ProductContent params={props.params} />
      </Suspense>
      <SiteFooter />
    </>
  );
}

async function ProductContent({ params }: { params: PageProps<"/products/[id]">["params"] }) {
  const { id } = await params;
  const p = getProduct(id);
  if (!p) notFound();

  const dependents = dependentsOf(p.id);
  const specified = p.schema.length > 0;

  return (
      <main className="mx-auto max-w-4xl px-4 pb-24 pt-28 sm:px-6">
        <Link href="/products" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Catalog
        </Link>

        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={p.status} />
          <KindBadge kind={p.kind} />
          <LevelBadge level={p.level} />
          <MetaBadge>{CATEGORY_LABEL[p.category]}</MetaBadge>
          {p.requiresHumanReview && <MetaBadge>human review</MetaBadge>}
        </div>
        <h1 className="text-balance text-4xl font-semibold tracking-tight">{p.name}</h1>
        <p className="mt-3 text-pretty text-muted-foreground">{p.summary}</p>
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          #{String(p.no).padStart(2, "0")} · {p.id}@{p.version} · {KIND_META[p.kind].description.toLowerCase()}
        </p>

        {!specified && (
          <p className="mt-8 border border-dashed p-4 text-sm text-muted-foreground">
              This product is classified on the roadmap but its contract is not specified yet.
            </p>
        )}

        <div className="mt-12 grid gap-x-10 gap-y-8 md:grid-cols-2">
          <Block title="Inputs">
            {p.inputs.length > 0 ? (
              <ul className="space-y-1">
                {p.inputs.map((i) => (
                  <li key={i}>
                    <Link href={`/products/${i}`} className="font-mono text-sm text-electric hover:underline">
                      {i}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Raw observations{p.observationTypes.length > 0 && <>: <span className="font-mono">{p.observationTypes.join(", ")}</span></>}
              </p>
            )}
          </Block>

          <Block title="Used by">
            {dependents.length > 0 ? (
              <ul className="space-y-1">
                {dependents.map((d) => (
                  <li key={d.id}>
                    <Link href={`/products/${d.id}`} className="font-mono text-sm text-electric hover:underline">
                      {d.id}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing depends on this yet.</p>
            )}
          </Block>

          <Block title="Operations">
            <Row k="Refresh" v={p.refresh} />
            <Row k="Time semantics" v={p.time} />
            <Row k="Coordinates" v={p.crs ?? "none"} />
            <Row k="Evidence" v={p.evidence} />
            <Row k="Privacy" v={p.privacy} />
            <Row k="Outputs" v={p.outputs.join(", ") || "—"} />
          </Block>

          <Block title="Quality checks">
            {p.quality.length > 0 ? (
              <ul className="space-y-1 font-mono text-sm">
                {p.quality.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </Block>
        </div>

        {p.params.length > 0 && (
          <Block title="Parameters" className="mt-8">
            <ul className="space-y-2 text-sm">
              {p.params.map((x) => (
                <li key={x.name}>
                  <span className="font-mono text-electric">{x.name}</span>
                  {x.required && <span className="ml-2 text-xs text-destructive">required</span>}
                  <span className="text-muted-foreground"> — {x.description}</span>
                  {x.default !== undefined && <span className="font-mono text-xs text-muted-foreground"> (default {String(x.default)})</span>}
                </li>
              ))}
            </ul>
          </Block>
        )}

        {specified && (
          <Block title="Output schema" className="mt-8">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="font-mono text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-normal">field</th>
                    <th className="py-2 pr-4 font-normal">type</th>
                    <th className="py-2 pr-4 font-normal">unit</th>
                    <th className="py-2 font-normal">description</th>
                  </tr>
                </thead>
                <tbody>
                  {p.schema.map((f) => (
                    <tr key={f.name} className="border-t">
                      <td className="py-2 pr-4 font-mono text-electric">{f.name}</td>
                      <td className="py-2 pr-4 font-mono">{f.type}</td>
                      <td className="py-2 pr-4 font-mono text-muted-foreground">{f.unit ?? "—"}</td>
                      <td className="py-2 text-muted-foreground">{f.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Block>
        )}

        <Block title="Limitations" className="mt-8">
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            {p.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Block>
      </main>
  );
}

function Block({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      <h2 className="border-b pb-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">{title}</h2>
      <div className="pt-3">{children}</div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-mono">{v}</span>
    </div>
  );
}
