import { and, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/db";
import { flowRuns, flows, projectProducts, sourceLanes, sources, timelines } from "@/db/schema";
import { getProduct } from "@/products";
import { FlowEditor } from "@/components/flow/flow-editor";
import { FlowResults } from "@/components/flow/flow-results";
import type { FlowOutput, NodeTrace } from "@/lib/flow/engine";
import type { FlowGraph } from "@/lib/flow/types";
import { getWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Flow — ARGUS" };

export default function FlowPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div aria-busy="true" className="h-96 animate-pulse bg-muted" />}>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = (await getWorkspace())!;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [flow] = await db.select().from(flows).where(and(eq(flows.id, id), eq(flows.projectId, ws.project.id)));
  if (!flow) notFound();
  const [run] = await db.select().from(flowRuns).where(eq(flowRuns.flowId, id)).orderBy(desc(flowRuns.createdAt)).limit(1);

  const [tls, lns, srcs, mine] = await Promise.all([
    db.select().from(timelines).where(eq(timelines.projectId, ws.project.id)),
    db.select().from(sourceLanes).where(eq(sourceLanes.projectId, ws.project.id)),
    db.select().from(sources).where(eq(sources.projectId, ws.project.id)),
    db.select().from(projectProducts).where(eq(projectProducts.projectId, ws.project.id)),
  ]);
  const choices = {
    sources: [
      ...tls.flatMap((t) => [t.name, ...lns.filter((l) => l.timelineId === t.id).map((l) => `${t.name} / ${l.name}`)]),
      ...srcs.map((s) => s.name),
    ],
    products: mine.flatMap((r) => { const p = getProduct(r.productId); return p && p.observationTypes.length ? [{ id: p.id, name: p.name }] : []; }),
  };

  const trace = (run?.trace ?? []) as NodeTrace[];
  const status = Object.fromEntries(trace.map((t) => [t.id, { out: t.outCount, error: t.error, note: t.note }]));

  return (
    <>
      <Link href="/dashboard/flows" className="mb-3 inline-block text-sm text-muted-foreground hover:text-foreground">← All flows</Link>
      <FlowEditor id={id} name={flow.name} graph={flow.graph as FlowGraph} status={status} choices={choices} />
      <div className="mt-10">
        {run ? (
          run.status === "failed" && trace.length === 0 ? (
            <p className="text-sm text-destructive">Last run failed: {run.error}</p>
          ) : (
            <FlowResults trace={trace} output={run.output as unknown as FlowOutput} at={`${run.createdAt.toISOString().slice(0, 16).replace("T", " ")}Z${run.status === "failed" ? " (a node failed)" : ""}`} />
          )
        ) : (
          <p className="text-sm text-muted-foreground">Not run yet. Press Save and run.</p>
        )}
      </div>
    </>
  );
}
