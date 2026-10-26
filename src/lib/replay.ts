import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { jobs, observations, projectProducts, projects, sources, timelines, uploads } from "@/db/schema";
import type { EngineEdge, EngineNode } from "@/components/design/engine-map";
import { loadEngine } from "@/lib/engine";
import { srcKey, tlKey } from "@/lib/source-key";
import { getProduct } from "@/products";

/** One job on the replay clock: the nodes it lights up, when it started and ended, and how. */
export type ReplayJob = { nodes: string[]; from: number; to: number | null; failed: boolean };
export type ReplayEvent = { t: number; text: string; node?: string };

/**
 * Everything needed to play a project back from the day it was made until now: the engine as it
 * stands today, when each part of it appeared, every job, and when each layer's rows arrived.
 * The player recomputes node states at any moment from these, with the same rules as the live map.
 */
export type ReplayData = {
  start: number;
  end: number;
  nodes: EngineNode[];
  edges: EngineEdge[];
  born: Record<string, number>;
  jobs: ReplayJob[];
  /** Per layer node: [bucket start ms, rows arrived in it], in time order. */
  arrivals: Record<string, [number, number][]>;
  /** Per product node: the layer nodes it sums. */
  feeds: Record<string, string[]>;
  events: ReplayEvent[];
};

const AGENT_OF: Record<string, string> = { analyze_frame: "a:perceive", process_upload: "a:inspect", poll_source: "a:normalize", investigate: "f:correlate" };
const WHAT: Record<string, string> = { analyze_frame: "a frame", process_upload: "a file", poll_source: "new readings", investigate: "a case" };
const MAX_EVENTS = 400;

/** `audience: "public"` is for /explore: file names are left out, as the share dialog promises. */
export async function loadReplay(projectId: string, audience: "owner" | "public" = "owner"): Promise<ReplayData | null> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return null;
  const [engine, jobRows, obsRows, enabled, srcRows, tlRows, upRows] = await Promise.all([
    loadEngine(projectId, { level: project.agentLevel, frequency: project.frequency }),
    db.select({ kind: jobs.kind, source: jobs.source, status: jobs.status, createdAt: jobs.createdAt, runAt: jobs.runAt, finishedAt: jobs.finishedAt }).from(jobs).where(eq(jobs.projectId, projectId)).orderBy(jobs.createdAt),
    db
      .select({ type: observations.type, sourceId: observations.sourceId, at: sql<number>`(extract(epoch from date_trunc('minute', ${observations.arrivalTime})) * 1000)::float8`, n: sql<number>`count(*)::int` })
      .from(observations)
      .where(eq(observations.projectId, projectId))
      .groupBy(observations.type, observations.sourceId, sql`date_trunc('minute', ${observations.arrivalTime})`)
      .orderBy(sql`3`),
    db.select().from(projectProducts).where(eq(projectProducts.projectId, projectId)),
    db.select({ id: sources.id, kind: sources.kind, name: sources.name, createdAt: sources.createdAt }).from(sources).where(eq(sources.projectId, projectId)),
    db.select({ id: timelines.id, name: timelines.name, createdAt: timelines.createdAt }).from(timelines).where(eq(timelines.projectId, projectId)),
    db.select({ filename: uploads.filename, timelineId: uploads.timelineId, createdAt: uploads.createdAt }).from(uploads).where(and(eq(uploads.projectId, projectId))),
  ]);

  const start = project.createdAt.getTime();
  const end = Math.max(Date.now(), start + 60_000);
  const has = new Set(engine.nodes.map((n) => n.id));
  const label = new Map(engine.nodes.map((n) => [n.id, n.label]));
  const born: Record<string, number> = {};
  const seen = (id: string, t: number) => { if (has.has(id) && !(born[id] <= t)) born[id] = Math.max(t, start); };
  const events: ReplayEvent[] = [{ t: start, text: `Project “${project.name}” created` }];

  for (const r of enabled) {
    seen(`p:${r.productId}`, r.enabledAt.getTime());
    events.push({ t: r.enabledAt.getTime(), text: `Chose the data product ${getProduct(r.productId)?.name ?? r.productId}`, node: `p:${r.productId}` });
  }
  for (const t of tlRows) {
    seen(tlKey(t.id), t.createdAt.getTime());
    events.push({ t: t.createdAt.getTime(), text: `Added the files timeline ${t.name}`, node: tlKey(t.id) });
  }
  for (const s of srcRows) {
    const key = s.kind === "screen" ? "screen" : srcKey(s.id);
    seen(key, s.createdAt.getTime());
    events.push({ t: s.createdAt.getTime(), text: `Connected ${s.name}`, node: key });
  }
  for (const u of upRows) {
    const key = u.timelineId ? tlKey(u.timelineId) : "files";
    seen(key, u.createdAt.getTime());
    events.push({ t: u.createdAt.getTime(), text: audience === "public" ? "Uploaded a file" : `Uploaded ${u.filename}`, node: key });
  }

  const replayJobs: ReplayJob[] = [];
  const jobEvents: ReplayEvent[] = [];
  for (const j of jobRows) {
    const agent = AGENT_OF[j.kind];
    const nodes = [j.source, agent].filter((n): n is string => !!n && has.has(n));
    const from = Math.max(j.createdAt.getTime(), start);
    for (const n of nodes) seen(n, from);
    const to = j.finishedAt?.getTime() ?? (j.status === "done" || j.status === "failed" ? from : null);
    replayJobs.push({ nodes, from, to, failed: j.status === "failed" });
    if (to !== null && agent && has.has(agent)) {
      const src = j.source && label.get(j.source);
      jobEvents.push({ t: to, text: `${label.get(agent)} ${j.status === "failed" ? "failed on" : "finished"} ${WHAT[j.kind] ?? "a job"}${src ? ` from ${src}` : ""}`, node: agent });
    }
  }
  events.push(...jobEvents.slice(-MAX_EVENTS));

  // Rows land in a layer; a webhook source has no jobs, so its deliveries light it up instead.
  const arrivals: Record<string, [number, number][]> = {};
  const firstRow = new Set<string>();
  for (const o of obsRows) {
    const id = `l:${o.type}`;
    if (!has.has(id)) continue;
    seen(id, o.at);
    (arrivals[id] ??= []).push([o.at, o.n]);
    if (o.sourceId && has.has(srcKey(o.sourceId))) seen(srcKey(o.sourceId), o.at);
    if (!firstRow.has(id)) {
      firstRow.add(id);
      events.push({ t: o.at, text: `First ${label.get(id)?.toLowerCase()} rows arrived`, node: id });
    }
  }

  // Anything still unplaced appears when what feeds it does (or at the start).
  const ups = (id: string) => engine.edges.filter(([, to]) => to === id).map(([from]) => from);
  for (let pass = 0; pass < 4; pass++) {
    for (const n of engine.nodes) {
      if (born[n.id] !== undefined) continue;
      const b = ups(n.id).map((u) => born[u]).filter((x) => x !== undefined);
      if (b.length || pass === 3) born[n.id] = b.length ? Math.min(...b) : start;
    }
  }

  const feeds: Record<string, string[]> = {};
  for (const n of engine.nodes) if (n.col === 4) feeds[n.id] = ups(n.id);

  events.sort((a, b) => a.t - b.t);
  return { start, end, nodes: engine.nodes, edges: engine.edges, born, jobs: replayJobs, arrivals, feeds, events };
}
