import { and, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { setProductEnabled } from "@/app/actions";
import { db } from "@/db";
import { projectProducts, sourceLanes, timelines, uploads } from "@/db/schema";
import { CapturePanel } from "@/components/dashboard/capture-panel";
import { SourceStrip } from "@/components/dashboard/source-strip";
import { UploadPanel } from "@/components/dashboard/upload-panel";
import { loadLinked } from "@/lib/product-link";
import { sourcesFor } from "@/lib/product-sources";
import { PageHeader, SectionTitle } from "@/components/dashboard/page-header";
import { Widget } from "@/components/widgets";
import { Button } from "@/components/ui/button";
import { AutoRefresh } from "@/components/dashboard/pipeline-controls";
import { StateBadge, type AgentState } from "@/components/design/agent-kit";
import { money } from "@/lib/agent-levels";
import { loadEngine } from "@/lib/engine";
import { loadDatasets } from "@/lib/product-data";
import { getWorkspace } from "@/lib/session";
import { getProduct } from "@/products";

export const metadata: Metadata = { title: "Data product — ARGUS" };

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div aria-busy="true" className="h-64 animate-pulse bg-muted" />}>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = getProduct(id);
  if (!product || product.status !== "supported") notFound();
  const ws = (await getWorkspace())!;

  const [on] = await db.select().from(projectProducts).where(and(eq(projectProducts.projectId, ws.project.id), eq(projectProducts.productId, id)));
  const datasets = await loadDatasets(ws.project.id, product.observationTypes);
  const linked = await loadLinked(ws.project.id);
  const needs = sourcesFor(id);
  const [tls, lns] = await Promise.all([
    db.select().from(timelines).where(eq(timelines.projectId, ws.project.id)).orderBy(timelines.createdAt),
    db.select().from(sourceLanes).where(eq(sourceLanes.projectId, ws.project.id)).orderBy(sourceLanes.createdAt),
  ]);
  const lanes = lns.map((l) => ({ id: l.id, name: `${tls.find((t) => t.id === l.timelineId)?.name ?? "Files"} / ${l.name}` }));
  const engine = await loadEngine(ws.project.id, { level: ws.project.agentLevel, frequency: ws.project.frequency });
  // Everything upstream of this product in the engine: its layers, the agents writing them, the sources feeding those.
  const up = new Set([`p:${id}`]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const [a, b] of engine.edges) if (up.has(b) && !up.has(a)) { up.add(a); grew = true; }
  }
  const feeding = engine.sources.filter((s) => up.has(s.key));
  const agents = engine.nodes.filter((n) => (n.col === 1 || n.col === 2) && up.has(n.id));
  const overall = (states: AgentState[]): AgentState =>
    states.includes("working") ? "working" : states.includes("error") ? "error" : states.includes("paused") ? "paused" : states.includes("done") ? "done" : "waiting";
  const setup = [
    { label: "Sources", state: overall(feeding.map((s) => s.state)), text: feeding.length ? feeding.map((s) => s.name).join(", ") : "None feeding it yet", href: "#sources", cta: feeding.length ? "Manage" : "Connect" },
    { label: "Agents", state: overall(agents.map((a) => a.state)), text: agents.length ? agents.map((a) => a.label).join(", ") : "Start when a source sends data", href: "/dashboard/agents", cta: "See them" },
    { label: "Accuracy and cost", state: undefined, text: `${engine.summary.level} · ~${engine.summary.accuracy}%${engine.summary.costPerHour ? ` · ${money(engine.summary.costPerHour)}/h` : ""}`, href: "/dashboard/agents", cta: "Tune" },
  ];
  const files = needs.some((n) => n.kind === "files") ? await db.select().from(uploads).where(eq(uploads.projectId, ws.project.id)).orderBy(desc(uploads.createdAt)) : [];

  return (
    <>
      <PageHeader title={product.name} description={product.summary}>
        <form action={setProductEnabled.bind(null, id, !on)}>
          <Button type="submit" variant={on ? "outline" : "default"}>{on ? "Disable" : "Enable for this project"}</Button>
        </form>
      </PageHeader>

      <AutoRefresh active={feeding.some((s) => s.state === "working")} everyMs={5000} />
      <ol className="mb-10 grid gap-px border bg-border sm:grid-cols-3" aria-label="Setup">
        {setup.map((s, i) => (
          <li key={s.label} className="flex flex-col gap-1 bg-background p-3">
            <span className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{i + 1} · {s.label}</span>
              {s.state && <StateBadge state={s.state} />}
            </span>
            <span className="truncate text-sm" title={s.text}>{s.text}</span>
            <Link href={s.href} className="text-xs text-electric underline-offset-4 hover:underline">{s.cta} →</Link>
          </li>
        ))}
      </ol>

      <section>
        <SectionTitle>Widget</SectionTitle>
        <Widget productId={id} data={datasets} />
      </section>

      <section className="mt-12" id="sources">
        <SectionTitle>Feed this product</SectionTitle>
        <SourceStrip productId={id} linked={linked} href="#sources" />
        <details className="mt-3" open={!needs.every((n) => linked[n.kind])}>
          <summary className="inline-block cursor-pointer border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">Connect data</summary>
          <div className="mt-4">
            {needs.some((n) => n.kind === "files") && (
              lanes.length ? (
                <UploadPanel lanes={lanes} uploads={files.map((r) => ({ id: r.id, filename: r.filename, size: r.size, status: r.status, createdAt: r.createdAt.toISOString() }))} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Files go in through a lane. <Link href="/dashboard/sources" className="text-electric underline">Add a files source and a lane</Link>, then upload here.
                </p>
              )
            )}
            {needs.some((n) => n.kind === "screen") && <CapturePanel projectId={ws.project.id} agentLevelIndex={ws.project.agentLevel} every={ws.project.frequency} />}
            <Link href="/dashboard/sources" className="mt-4 inline-block text-sm text-muted-foreground underline hover:text-foreground">All sources and timeline</Link>
          </div>
        </details>
      </section>

      <section className="mt-12">
        <SectionTitle>Datasets in this product</SectionTitle>
        <ul>
          {datasets.map((d) => (
            <li key={d.type} className="grid gap-2 border-b py-4 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="font-mono">{d.type}</p>
                <p className="text-xs text-muted-foreground">
                  {d.total} row{d.total === 1 ? "" : "s"}
                  {d.latest ? ` · latest ${new Date(d.latest).toISOString().slice(0, 16).replace("T", " ")}Z` : ""}
                </p>
              </div>
              {d.total > 0 && (
                <a href={`/api/products/${id}/export?type=${d.type}`} className="text-electric underline">Download CSV</a>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Fields</p>
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {product.schema.map((f) => (
            <li key={f.name}><span className="font-mono">{f.name}</span> <span className="text-xs text-muted-foreground">{f.type} · {f.description}</span></li>
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <SectionTitle>Limits</SectionTitle>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {product.limitations.map((l) => <li key={l}>{l}</li>)}
        </ul>
        <Link href="/dashboard" className="mt-6 inline-block text-sm text-muted-foreground underline hover:text-foreground">All data products</Link>
      </section>
    </>
  );
}
