import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { createFlow } from "@/app/flow-actions";
import { db } from "@/db";
import { flows } from "@/db/schema";
import { PageHeader, SectionTitle } from "@/components/dashboard/page-header";
import { AutoRefresh } from "@/components/dashboard/pipeline-controls";
import { SourceRows } from "@/components/dashboard/source-rows";
import { EngineMap } from "@/components/design/engine-map";
import { money } from "@/lib/agent-levels";
import { loadEngine } from "@/lib/engine";
import { Button } from "@/components/ui/button";
import type { FlowGraph } from "@/lib/flow/types";
import { getWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Flows — ARGUS" };

export default async function FlowsPage() {
  const ws = (await getWorkspace())!;
  const [rows, engine] = await Promise.all([
    db.select().from(flows).where(eq(flows.projectId, ws.project.id)).orderBy(desc(flows.updatedAt)),
    loadEngine(ws.project.id, { level: ws.project.agentLevel, frequency: ws.project.frequency }),
  ]);
  const s = engine.summary;
  const busy = engine.sources.some((x) => x.state === "working");
  const facts = [
    `${s.working} agent${s.working === 1 ? "" : "s"} working`,
    s.paused ? `${s.paused} source${s.paused === 1 ? "" : "s"} paused` : null,
    s.failed ? `${s.failed} failed` : null,
    `${s.level} · ~${s.accuracy}% accuracy`,
    s.costPerHour ? `${money(s.costPerHour)}/h live` : null,
  ].filter(Boolean);

  return (
    <>
      <AutoRefresh active={busy} everyMs={4000} />
      <PageHeader title="Flows" description="The engine behind your data products: sources on the left, agents in the middle, data products on the right. Lines move while work is running." />

      <SectionTitle>The engine</SectionTitle>
      <p className="mb-3 font-mono text-xs text-muted-foreground">
          {facts.join(" · ")} · <Link href="/dashboard/agents" className="underline underline-offset-4 hover:text-foreground">Tune</Link>
      </p>
      {engine.nodes.length === 0 ? (
        <p className="mb-12 border border-dashed p-6 text-sm text-muted-foreground">Nothing running yet. Add a data product and a source and the engine draws itself here.</p>
      ) : (
        <div className="mb-8">
          <EngineMap nodes={engine.nodes} edges={engine.edges} />
        </div>
      )}

      <SectionTitle>Sources feeding it</SectionTitle>
      <div className="mb-12">
        <SourceRows sources={engine.sources} />
      </div>

      <SectionTitle>Custom flows</SectionTitle>
      <p className="-mt-2 mb-4 max-w-2xl text-sm text-muted-foreground">Wire data, filters, sorting, AI agents and fact checks into your own line and run it on the data above.</p>
      <form action={createFlow} className="mb-4 flex flex-wrap gap-2">
        <input name="name" placeholder="Name it, e.g. Strongest cracks, fact checked" className="min-w-0 flex-1 border bg-background px-3 py-2 text-sm" />
        <Button type="submit">Start from an example</Button>
        <Button type="submit" name="blank" value="1" variant="outline">Blank canvas</Button>
      </form>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">None yet. The example counts your strongest findings by label and charts them.</p>
      ) : (
        <ul className="border">
          {rows.map((f) => {
            const g = f.graph as FlowGraph;
            return (
              <li key={f.id} className="border-b last:border-b-0">
                <Link href={`/dashboard/flows/${f.id}`} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 hover:bg-accent/40">
                  <span className="font-medium">{f.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{g.nodes.length} nodes · edited {f.updatedAt.toISOString().slice(0, 16).replace("T", " ")}Z</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
