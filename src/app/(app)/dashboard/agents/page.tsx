import { and, desc, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { alerts, assets, jobs, observations, projectProducts, uploads } from "@/db/schema";
import { ProductionLine, type Good, type Material, type ReplayCase } from "@/components/dashboard/production-line";
import { resolveConfig, resolveLanes } from "@/lib/agent-config";
import { LaneBuilder } from "@/components/dashboard/lane-builder";
import { AGENT_LEVELS, agentLevel } from "@/lib/agent-levels";
import type { Facts } from "@/lib/fusion";
import { getProduct } from "@/products";
import { severityInput } from "@/lib/agents/orchestrator";
import { PageHeader, SectionTitle } from "@/components/dashboard/page-header";
import { AutoRefresh } from "@/components/dashboard/pipeline-controls";
import { TuneControl } from "@/components/dashboard/tune-control";
import { AgentBadge, StateBadge, stateHint, type AgentKind } from "@/components/design/agent-kit";
import { loadEngine } from "@/lib/engine";
import { cn } from "@/lib/utils";
import type { TraceStep } from "@/lib/agents/orchestrator";
import { getWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Agents — ARGUS" };

/** The stations. Each does one job; "code" stations are deterministic, "model" stations call Meta. */
const AGENTS = [
  { id: "perception", name: "Perception", kind: "model", job: "Intake and inspection. Reads photos and frames and lists what is visible, with a confidence for each finding.", takes: "Raw photos and video frames", makes: "Observations (findings with confidence)" },
  { id: "correlation", name: "Correlation", kind: "code", job: "Kitting. Gathers vibration, weather and inspection history for the same asset into one fact sheet.", takes: "One finding plus every reading in the window", makes: "A fused fact sheet, by event time" },
  { id: "analysis", name: "Analysis", kind: "code", job: "Grading. Scores severity from the fact sheet with fixed rules. The model never sets severity.", takes: "The fact sheet", makes: "Severity and the reasons it fired" },
  { id: "reasoning", name: "Reasoning", kind: "model", job: "Assembly. Drafts the brief: title, summary, claims that cite observation ids, limitations and a next step.", takes: "Fact sheet and severity", makes: "A draft brief with cited claims" },
  { id: "verification", name: "Verification", kind: "code", job: "Quality assurance. Checks every drafted claim against the facts and rejects what it cannot back up.", takes: "The draft brief", makes: "Only claims that pass, then an alert for a person to sign off" },
] as const;

const KIND = { code: "deterministic code", model: "Meta model" } as const;

export default async function AgentsPage() {
  const ws = (await getWorkspace())!;
  const pid = ws.project.id;
  const config = resolveConfig(ws.project.agentConfig);
  const lvl = agentLevel(ws.project.agentLevel);
  const [runs, [busy], [perc], confRows, typeCounts, [fileCount], enabledRows, engine] = await Promise.all([
    db
      .select({ a: alerts, asset: assets.name })
      .from(alerts)
      .leftJoin(assets, eq(alerts.assetId, assets.id))
      .where(eq(alerts.projectId, ws.project.id))
      .orderBy(desc(alerts.createdAt))
      .limit(10),
    db.select({ n: sql<number>`count(*)::int` }).from(jobs).where(sql`${jobs.projectId} = ${ws.project.id} and ${jobs.status} in ('queued','running')`),
    db
      .select({ n: sql<number>`count(*)::int`, ms: sql<number>`coalesce(avg(extract(epoch from (${jobs.finishedAt} - ${jobs.runAt})) * 1000), 0)::int` })
      .from(jobs)
      .where(sql`${jobs.projectId} = ${ws.project.id} and ${jobs.kind} = 'process_upload' and ${jobs.status} = 'done'`),
    db.select({ c: observations.confidence }).from(observations).where(and(eq(observations.projectId, pid), eq(observations.type, "defect_detected"))).limit(200),
    db.select({ type: observations.type, n: sql<number>`count(*)::int` }).from(observations).where(eq(observations.projectId, pid)).groupBy(observations.type),
    db.select({ n: sql<number>`count(*)::int` }).from(uploads).where(eq(uploads.projectId, pid)),
    db.select().from(projectProducts).where(eq(projectProducts.projectId, pid)),
    loadEngine(pid, { level: ws.project.agentLevel, frequency: ws.project.frequency }),
  ]);
  const working = engine.nodes.filter((n) => n.col === 1 || n.col === 2);
  const feeds = (id: string) => engine.edges.filter(([, to]) => to === id).map(([from]) => engine.nodes.find((n) => n.id === from)?.label).filter(Boolean);
  const outs = (id: string) => engine.edges.filter(([from]) => from === id).map(([, to]) => engine.nodes.find((n) => n.id === to)?.label).filter(Boolean);

  const confidences = confRows.map((r) => r.c).filter((c): c is number => c !== null);
  const countOf = (types: readonly string[]) => typeCounts.filter((t) => types.includes(t.type)).reduce((n, t) => n + t.n, 0);
  const materials: Material[] = [
    { label: "Photos and files", count: fileCount.n, unit: "files", href: "/dashboard/sources" },
    { label: "Sensor readings", count: countOf(["sensor_reading"]), unit: "rows", href: "/dashboard" },
    { label: "Weather", count: countOf(["weather"]), unit: "rows", href: "/dashboard" },
    { label: "Inspections", count: countOf(["inspection"]), unit: "rows", href: "/dashboard" },
  ];
  const goods: Good[] = enabledRows
    .map((r) => getProduct(r.productId))
    .filter((p) => p?.status === "supported")
    .map((p) => ({ label: p!.name, count: countOf(p!.observationTypes), unit: "rows", href: `/dashboard/products/${p!.id}` }));
  goods.push({ label: "Alert briefs", count: runs.length, unit: "recent", href: "/dashboard/alerts" });

  const traces = runs.map(({ a }) => (a.report as { trace?: TraceStep[] }).trace ?? []);
  const replay: ReplayCase[] = runs.flatMap(({ a }) => {
    const f = (a.report as { facts?: Facts }).facts;
    if (!f) return [];
    return [{ id: a.id, title: a.title, stored: a.severity as ReplayCase["stored"], input: severityInput(f) }];
  });
  const stats = (id: string) => {
    if (id === "perception") return { runs: perc.n, avg: perc.ms };
    const steps = traces.flatMap((t) => t.filter((s) => s.agent === id));
    return { runs: steps.length, avg: steps.length ? Math.round(steps.reduce((n, s) => n + s.ms, 0) / steps.length) : 0 };
  };

  return (
    <>
      <AutoRefresh active={busy.n > 0} />
      <PageHeader title="Agents" description="The agents turning your sources into data products. Set how careful they are and how often they look; see what each one is doing now." />

      <SectionTitle>Working for this project</SectionTitle>
      {working.length === 0 ? (
        <p className="mb-12 border border-dashed p-6 text-sm text-muted-foreground">No agents yet. They start as soon as a source sends data. Add one on <Link href="/dashboard/sources" className="underline underline-offset-4">Sources</Link>.</p>
      ) : (
        <ul className="mb-12 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {working.map((a) => (
            <li key={a.id} title={stateHint(a.state)} className={cn("flex flex-col gap-2 border p-4", a.state === "working" && "border-electric", a.state === "paused" && "border-chart-4", a.state === "error" && "border-destructive")}>
              <div className="flex items-center justify-between gap-2">
                <AgentBadge kind={a.kind as AgentKind} />
                <StateBadge state={a.state} />
              </div>
              <p className="font-medium">{a.label}</p>
              <p className="text-sm text-muted-foreground">{a.sub}</p>
              <dl className="mt-auto grid gap-1 border-t pt-2 font-mono text-[11px] text-muted-foreground">
                <div className="flex gap-2"><dt className="w-10 shrink-0">In</dt><dd className="truncate text-foreground">{feeds(a.id).join(", ") || "—"}</dd></div>
                <div className="flex gap-2"><dt className="w-10 shrink-0">Out</dt><dd className="truncate text-foreground">{outs(a.id).join(", ") || "—"}</dd></div>
                {a.rate && <div className="flex gap-2"><dt className="w-10 shrink-0">Runs</dt><dd className="tabular-nums">{a.rate}</dd></div>}
              </dl>
            </li>
          ))}
        </ul>
      )}

      <SectionTitle>Tune: cost, accuracy, frequency</SectionTitle>
      <div className="mb-12">
        <TuneControl level={ws.project.agentLevel} frequency={ws.project.frequency} />
      </div>

      <SectionTitle>Inside the alert line</SectionTitle>
      <ProductionLine
        materials={materials}
        goods={goods}
        config={config}
        levelDefaults={{ maxClaims: lvl.maxClaims, strict: lvl.strict, name: lvl.name }}
        confidences={confidences}
        replay={replay}
        stations={AGENTS.map((ag) => {
          const s = stats(ag.id);
          const latest = traces.flat().find((t) => t.agent === ag.id);
          return {
            id: ag.id,
            name: ag.name,
            kind: ag.kind,
            job: ag.job,
            takes: ag.takes,
            makes: ag.makes,
            runs: s.runs,
            avgMs: s.avg,
            inFlight: ag.id === "perception" ? busy.n : 0,
            sample: latest && (latest.input !== undefined || latest.output !== undefined) ? { input: latest.input, output: latest.output, ms: latest.ms } : null,
          };
        })}
      />
      <div className="mt-12">
        <SectionTitle>Lanes: run it your way</SectionTitle>
        <LaneBuilder initial={resolveLanes(ws.project.agentConfig)} confidences={confidences} levels={AGENT_LEVELS.map((l) => l.name)} />
      </div>
      <p className="mt-3 max-w-3xl text-xs text-muted-foreground">
        Perception runs when a file or frame arrives. The other four run in order for each finding that clears the gate, then a person approves or dismisses the alert. Numbers on this page come from recorded runs, not estimates.
      </p>

      <div className="mt-12">
        <SectionTitle>Recent runs</SectionTitle>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs yet. Load the sample bridge data on the Overview, or upload a photo named after an asset.</p>
        ) : (
          <ul className="space-y-8">
            {runs.map(({ a, asset }, ri) => {
              const trace = traces[ri];
              const total = trace.reduce((n, s) => n + s.ms, 0);
              return (
                <li key={a.id} className="border p-5">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {asset ?? "unmatched asset"} · {a.createdAt.toISOString().slice(0, 16).replace("T", " ")}Z · {a.severity} · {a.status}
                  </p>
                  <h3 className="mt-1 font-medium">{a.title}</h3>
                  {trace.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">No trace recorded for this run.</p>
                  ) : (
                    <ol className="mt-5">
                      {trace.map((s, i) => (
                        <li key={i} className="relative border-l pb-5 pl-5 last:pb-0">
                          <span className={`absolute -left-[5px] top-1 size-2.5 ${s.kind === "model" ? "bg-electric" : "bg-signal"}`} />
                          <div className="flex flex-wrap items-baseline gap-x-3">
                            <span className="text-sm font-medium capitalize">{s.agent}</span>
                            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{s.kind ? KIND[s.kind] : ""}</span>
                            <span className="font-mono text-xs text-muted-foreground">{s.ms}ms</span>
                          </div>
                          <div className="mt-1.5 h-1 bg-muted">
                            <div className={`h-1 ${s.kind === "model" ? "bg-electric" : "bg-signal"}`} style={{ width: `${Math.max(2, Math.round((s.ms / Math.max(total, 1)) * 100))}%` }} />
                          </div>
                          <p className="mt-2 text-sm">{s.note}</p>
                          {(s.input !== undefined || s.output !== undefined) && (
                            <details className="mt-2">
                              <summary className="cursor-pointer font-mono text-[11px] text-muted-foreground hover:text-foreground">Input and output</summary>
                              <div className="mt-2 grid gap-3 md:grid-cols-2">
                                <Json label="Received" value={s.input} />
                                <Json label="Produced" value={s.output} />
                              </div>
                            </details>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                  <p className="mt-4 font-mono text-[11px] text-muted-foreground">Total {total}ms</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

function Json({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <pre className="mt-1 max-h-60 overflow-auto bg-muted p-3 text-[11px] leading-relaxed">{value === undefined ? "not recorded" : JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}
