import "server-only";
import { BODY_PRODUCTS } from "@/lib/body-math";
import { PERSONA_PRODUCTS, PERSONAS } from "@/lib/personas";
import { and, eq, isNull, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { jobs, observations, sourceLanes, sources, timelines, uploads } from "@/db/schema";
import type { AgentKind, AgentState } from "@/components/design/agent-kit";
import type { EngineEdge, EngineNode } from "@/components/design/engine-map";
import { agentLevel } from "@/lib/agent-levels";
import { enabledRows, typeCounts } from "@/lib/project-reads";
import { srcKey, tlKey, type SourceKey } from "@/lib/source-key";
import { estimate } from "@/lib/tune";
import { getProduct } from "@/products";

/** One source as a pipeline: what it is, whether it is being worked on, and how far along it is. */
export type SourceStatus = {
  key: SourceKey;
  name: string;
  type: "files" | "screen" | "weather" | "sensor" | "webhook";
  state: AgentState;
  done: number;
  total: number;
  failed: number;
  unit: string;
  canPause: boolean;
};

type Counts = { queued: number; running: number; done: number; failed: number; paused: number };
const zero = (): Counts => ({ queued: 0, running: 0, done: 0, failed: 0, paused: 0 });

/** The state rule every surface shares: held, then busy, then broken, then finished, else waiting. */
function stateOf(c: Counts, held: boolean): AgentState {
  if (held) return "paused";
  if (c.running + c.queued > 0) return "working";
  if (c.failed > 0) return "error";
  if (c.done > 0) return "done";
  return "waiting";
}

const TYPE_OF: Record<string, SourceStatus["type"]> = { screen: "screen", weather: "weather", sensor_sim: "sensor", webhook: "webhook" };
const UNIT: Record<SourceStatus["type"], string> = { files: "files", screen: "frames", weather: "readings", sensor: "readings", webhook: "events" };

// Cached per request: the engine and the Sources window both need these.
const jobCounts = cache(async (projectId: string) => {
  const rows = await db
    .select({ source: jobs.source, kind: jobs.kind, status: jobs.status, n: sql<number>`count(*)::int` })
    .from(jobs)
    .where(eq(jobs.projectId, projectId))
    .groupBy(jobs.source, jobs.kind, jobs.status);
  const bySource = new Map<string, Counts>();
  const byKind = new Map<string, Counts>();
  for (const r of rows) {
    if (r.source) bySource.set(r.source, { ...(bySource.get(r.source) ?? zero()), [r.status]: (bySource.get(r.source)?.[r.status] ?? 0) + r.n });
    byKind.set(r.kind, { ...(byKind.get(r.kind) ?? zero()), [r.status]: (byKind.get(r.kind)?.[r.status] ?? 0) + r.n });
  }
  return { bySource, byKind };
});

/** Every source in the project with its live state, read from the job queue. */
export const loadSources = cache(async (projectId: string): Promise<SourceStatus[]> => {
  const [tls, lanes, filed, rows, [loose], webhookObs, { bySource }] = await Promise.all([
    db.select().from(timelines).where(eq(timelines.projectId, projectId)).orderBy(timelines.createdAt),
    db.select({ timelineId: sourceLanes.timelineId, input: sourceLanes.input }).from(sourceLanes).where(eq(sourceLanes.projectId, projectId)),
    db.selectDistinct({ id: uploads.timelineId }).from(uploads).where(eq(uploads.projectId, projectId)),
    db.select().from(sources).where(eq(sources.projectId, projectId)).orderBy(sources.createdAt),
    db.select({ n: sql<number>`count(*)::int` }).from(uploads).where(and(eq(uploads.projectId, projectId), isNull(uploads.timelineId))),
    db.select({ id: observations.sourceId, n: sql<number>`count(*)::int` }).from(observations).where(eq(observations.projectId, projectId)).groupBy(observations.sourceId),
    jobCounts(projectId),
  ]);
  const of = (key: string) => bySource.get(key) ?? zero();
  const line = (key: SourceKey, name: string, type: SourceStatus["type"], held: boolean): SourceStatus => {
    const c = of(key);
    return { key, name, type, state: stateOf(c, held), done: c.done, total: c.done + c.failed + c.queued + c.running + c.paused, failed: c.failed, unit: UNIT[type], canPause: true };
  };

  // A timeline that only holds live lanes takes no files; its sources are listed on their own below.
  const liveOnly = (id: string) => {
    const own = lanes.filter((l) => l.timelineId === id);
    const c = of(tlKey(id));
    return own.length > 0 && own.every((l) => l.input !== "files") && !filed.some((u) => u.id === id) && !(c.done + c.failed + c.queued + c.running + c.paused);
  };
  const out: SourceStatus[] = tls.filter((t) => !liveOnly(t.id)).map((t) => line(tlKey(t.id), t.name, "files", t.paused));
  if (loose.n > 0) out.push({ ...line("files", "Files", "files", false), canPause: false });
  let screen = false;
  for (const s of rows) {
    const type = TYPE_OF[s.kind];
    if (!type) continue;
    if (type === "screen") {
      // One live capture per project: every screen row shares the "screen" key.
      if (screen) continue;
      screen = true;
      out.push(line("screen", s.name, "screen", rows.some((r) => r.kind === "screen" && r.paused)));
    } else if (type === "webhook") {
      // Pushed, not queued: progress is the events it has delivered.
      const n = webhookObs.find((o) => o.id === s.id)?.n ?? 0;
      const fresh = s.lastSeenAt && Date.now() - s.lastSeenAt.getTime() < 10 * 60_000;
      out.push({ key: srcKey(s.id), name: s.name, type, state: s.paused ? "paused" : fresh ? "working" : n ? "done" : "waiting", done: n, total: n, failed: 0, unit: UNIT[type], canPause: true });
    } else out.push(line(srcKey(s.id), s.name, type, s.paused));
  }
  if (!screen && (of("screen").done || of("screen").queued || of("screen").paused)) out.push({ ...line("screen", "Screen share", "screen", false), canPause: false });
  return out;
});

/** The agents in the engine, what job kind each one runs, and what it reads from and writes to. */
const AGENTS: { id: string; job?: string; label: string; sub: string; kind: AgentKind; reads: SourceStatus["type"][]; writes: string[]; products?: readonly string[] }[] = [
  { id: "a:perceive", job: "analyze_frame", label: "Count people", sub: "Reads each sampled frame", kind: "model", reads: ["screen"], writes: ["people_count", "attribute_breakdown"] },
  { id: "a:inspect", job: "process_upload", label: "Inspect photos", sub: "Objects and defects in files", kind: "model", reads: ["files"], writes: ["object_detected", "defect_detected", "object_mask"] },
  { id: "a:personas", job: "review_screen", label: "Persona panel", sub: `${PERSONAS.length} simulated visitors per screen`, kind: "model", reads: ["files"], writes: ["persona_view", "persona_friction"], products: PERSONA_PRODUCTS },
  { id: "a:body", job: "body_check", label: "Body check", sub: "Scores each daily photo", kind: "model", reads: ["files"], writes: ["body_view"], products: BODY_PRODUCTS },
  { id: "a:normalize", job: "poll_source", label: "Normalize readings", sub: "Units, time, asset names", kind: "code", reads: ["weather", "sensor"], writes: ["weather", "sensor_reading"] },
  { id: "a:validate", label: "Validate events", sub: "Schema and key check", kind: "code", reads: ["webhook"], writes: [] },
];

const LAYER_NAME: Record<string, string> = {
  people_count: "People counts",
  attribute_breakdown: "Attribute shares",
  object_detected: "Object detections",
  object_track: "Object tracks",
  object_mask: "Object outlines",
  defect_detected: "Defects",
  weather: "Weather",
  sensor_reading: "Sensor readings",
  inspection: "Inspections",
  persona_view: "Persona views",
  persona_friction: "Friction points",
  persona_agreement: "Persona agreement",
  body_view: "Body checks",
  body_progress: "Body progress",
};
const layerName = (t: string) => LAYER_NAME[t] ?? t.replace(/_/g, " ");

export type EngineSummary = { working: number; paused: number; failed: number; level: string; accuracy: number; costPerHour: number; live: number };

/** The whole engine for one project, from real rows: sources → agents → fusion → layers → products. */
export async function loadEngine(projectId: string, tune: { level: number; frequency: number }) {
  const [srcs, { byKind }, layerRows, enabled] = await Promise.all([
    loadSources(projectId),
    jobCounts(projectId),
    typeCounts(projectId),
    enabledRows(projectId),
  ]);
  const prods = enabled.flatMap((r) => getProduct(r.productId) ?? []);
  const rows = new Map(layerRows.map((l) => [l.type, l.n]));

  const nodes: EngineNode[] = [];
  const edges: EngineEdge[] = [];

  for (const s of srcs) nodes.push({ id: s.key, col: 0, label: s.name, sub: s.type === "files" ? "Files timeline" : s.type, kind: "source", state: s.state, rate: s.total ? `${s.done}/${s.total} ${s.unit}` : `no ${s.unit} yet` });

  const special = [...PERSONA_PRODUCTS, ...BODY_PRODUCTS] as readonly string[];
  const personaOnly = prods.some((p) => special.includes(p.id)) && !prods.some((p) => p.observationTypes.some((t) => t === "object_detected" || t === "defect_detected" || t === "object_mask"));
  const agentState = new Map<string, AgentState>();
  for (const a of AGENTS) {
    const feeds = srcs.filter((s) => a.reads.includes(s.type));
    const c = (a.job && byKind.get(a.job)) || zero();
    if (!feeds.length && !c.done && !c.queued) continue;
    // An opt-in agent shows only when a product asked for it or it has already run.
    if (a.products && !c.done && !c.queued && !prods.some((p) => a.products!.includes(p.id))) continue;
    // A screenshot or body check-in project skips detection (see processUpload), so its uploads are not an AI step here.
    if (a.id === "a:inspect" && personaOnly) continue;
    // Held when every source it reads is held; for a webhook the source state is the agent's.
    const held = feeds.length > 0 && feeds.every((s) => s.state === "paused");
    const state = a.job ? stateOf(c, held) : feeds[0]?.state ?? "waiting";
    agentState.set(a.id, state);
    nodes.push({ id: a.id, col: 1, label: a.label, sub: a.sub, kind: a.kind, state, rate: a.job ? `${c.done} done${c.failed ? ` · ${c.failed} failed` : ""}` : undefined });
    for (const s of feeds) edges.push([s.key, a.id]);
  }

  const inv = byKind.get("investigate") ?? zero();
  const fusion = agentState.has("a:inspect") || agentState.has("a:normalize") || inv.done > 0;
  if (fusion) {
    nodes.push({ id: "f:correlate", col: 2, label: "Correlate & check", sub: "Joins findings with readings", kind: "model", state: stateOf(inv, false), rate: `${inv.done} cases` });
    for (const id of ["a:inspect", "a:normalize"]) if (agentState.has(id)) edges.push([id, "f:correlate"]);
  }

  // The persona panel's comparison is code: it measures agreement from the personas' attention points.
  if (agentState.has("a:personas")) {
    const rs = byKind.get("review_screen") ?? zero();
    nodes.push({ id: "f:personas", col: 2, label: "Compare personas", sub: "Agreement, clarity, carry-on", kind: "code", state: agentState.get("a:personas")!, rate: `${rs.done} screens` });
    edges.push(["a:personas", "f:personas"]);
  }

  // Day-over-day change is code too: it compares each check-in with day 1 and the day before.
  if (agentState.has("a:body")) {
    const bc = byKind.get("body_check") ?? zero();
    nodes.push({ id: "f:body", col: 2, label: "Track progress", sub: "Change vs day 1, streak", kind: "code", state: agentState.get("a:body")!, rate: `${bc.done} days` });
    edges.push(["a:body", "f:body"]);
  }

  // Layers: every type that has rows, plus every type an enabled product is waiting for.
  const types = new Set<string>([...rows.keys(), ...prods.flatMap((p) => p.observationTypes)]);
  for (const t of types) {
    const writer = AGENTS.find((a) => a.writes.includes(t) && agentState.has(a.id));
    const persona = t === "persona_agreement" && agentState.has("a:personas") ? "f:personas" : t === "body_progress" && agentState.has("a:body") ? "f:body" : undefined;
    const webhook = !writer && !persona && agentState.has("a:validate") ? "a:validate" : undefined;
    const from = writer?.id ?? persona ?? webhook;
    const up = from ? agentState.get(from === "f:personas" ? "a:personas" : from === "f:body" ? "a:body" : from) : undefined;
    const n = rows.get(t) ?? 0;
    nodes.push({ id: `l:${t}`, col: 3, label: layerName(t), sub: t, kind: "code", state: up === "working" ? "working" : up === "paused" ? "paused" : n ? "done" : "waiting", rate: `${n.toLocaleString("en-US")} rows` });
    if (from) edges.push([from, `l:${t}`]);
    if (fusion && (t === "defect_detected" || t === "sensor_reading")) edges.push(["f:correlate", `l:${t}`]);
  }

  for (const p of prods) {
    const feeds = p.observationTypes.filter((t) => types.has(t));
    const n = feeds.reduce((a, t) => a + (rows.get(t) ?? 0), 0);
    const ups = feeds.map((t) => nodes.find((x) => x.id === `l:${t}`)!.state);
    const state: AgentState = ups.includes("working") ? "working" : ups.includes("paused") ? "paused" : n ? "done" : "waiting";
    nodes.push({ id: `p:${p.id}`, col: 4, label: p.name, sub: p.observationTypes.length ? p.kind : "sample data only", kind: "product", state, rate: p.observationTypes.length ? `${n.toLocaleString("en-US")} rows` : undefined });
    for (const t of feeds) edges.push([`l:${t}`, `p:${p.id}`]);
  }

  const agents = nodes.filter((n) => n.col === 1 || n.col === 2);
  const live = srcs.filter((s) => s.type !== "files" && s.state !== "paused").length;
  const lvl = agentLevel(tune.level);
  const summary: EngineSummary = {
    working: agents.filter((a) => a.state === "working").length,
    paused: srcs.filter((s) => s.state === "paused").length,
    failed: srcs.reduce((a, s) => a + s.failed, 0),
    level: lvl.name,
    accuracy: lvl.accuracy,
    // The model bill comes from frames being sampled now; polled readings run through code and cost nothing per hour.
    costPerHour: srcs.some((s) => s.type === "screen" && s.state === "working") ? estimate(tune.level, tune.frequency).cost : 0,
    live,
  };
  return { nodes, edges, sources: srcs, summary };
}
