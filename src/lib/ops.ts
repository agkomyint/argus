import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { jobs, projectProducts, projects, sourceLanes, sources, timelines } from "@/db/schema";
import { AGENT_LEVELS, agentLevel } from "@/lib/agent-levels";
import { newIngestKey } from "@/lib/connectors";
import { loadEngine } from "@/lib/engine";
import { drainJobs, enqueue } from "@/lib/jobs";
import { pickableProducts } from "@/lib/pickable";
import { loadDatasets } from "@/lib/product-data";
import { parseKey, srcKey } from "@/lib/source-key";
import { estimate, FREQUENCIES } from "@/lib/tune";
import { getProduct } from "@/products";

/**
 * Everything a person can do to set up and run a project, as plain functions that take the user id.
 * The dashboard's server actions, the REST API and the MCP server all call these, so they cannot drift.
 * Every function checks that the project belongs to the user and throws OpsError otherwise.
 */
export class OpsError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export const SOURCE_KINDS = ["files", "screen", "weather", "sensor_sim", "webhook"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
const SOURCE_NAME: Record<SourceKind, string> = { files: "Files", screen: "Screen share", weather: "Weather feed", sensor_sim: "Sensor", webhook: "Webhook" };

export async function listProjects(userId: string) {
  return db.select().from(projects).where(eq(projects.userId, userId)).orderBy(asc(projects.createdAt));
}

export async function ownProject(userId: string, projectId: string) {
  const ok = z.uuid().safeParse(projectId);
  const [p] = ok.success ? await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId))) : [];
  if (!p) throw new OpsError("Project not found", 404);
  return p;
}

export const listProducts = () => pickableProducts();

function checkProducts(ids: string[]) {
  const bad = ids.filter((id) => getProduct(id)?.status !== "supported");
  if (bad.length) throw new OpsError(`Unknown or unavailable data product: ${bad.join(", ")}. Call list_products for the ids.`);
  return [...new Set(ids)];
}

export async function createProject(userId: string, name: string, productIds: string[]) {
  const clean = name.trim();
  if (clean.length < 2 || clean.length > 80) throw new OpsError("Give the project a name of 2 to 80 characters");
  const ids = checkProducts(productIds);
  if (!ids.length) throw new OpsError("Pick at least one data product");
  const [project] = await db.insert(projects).values({ userId, name: clean, kind: "other" }).returning();
  await db.insert(projectProducts).values(ids.map((productId) => ({ projectId: project.id, productId })));
  return project;
}

export async function setProducts(userId: string, projectId: string, change: { add?: string[]; remove?: string[] }) {
  await ownProject(userId, projectId);
  const add = checkProducts(change.add ?? []);
  if (add.length) await db.insert(projectProducts).values(add.map((productId) => ({ projectId, productId }))).onConflictDoNothing();
  for (const productId of change.remove ?? []) await db.delete(projectProducts).where(and(eq(projectProducts.projectId, projectId), eq(projectProducts.productId, productId)));
}

const sourceConfig = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  asset: z.string().trim().min(1).max(60).optional(),
  surge: z.boolean().optional(),
  lanes: z.array(z.object({ name: z.string().trim().min(1).max(60), note: z.string().trim().max(300).optional() })).max(12).optional(),
});
export type SourceConfig = z.infer<typeof sourceConfig>;

/**
 * Add a source. Weather needs lat and lng; a sensor needs an asset name; files can come with lanes.
 * With the settings given, polled sources start at once. Returns what the caller needs to finish setup.
 */
export async function addSource(userId: string, projectId: string, kind: SourceKind, raw: SourceConfig = {}) {
  await ownProject(userId, projectId);
  if (!SOURCE_KINDS.includes(kind)) throw new OpsError(`Unknown source kind. Use one of: ${SOURCE_KINDS.join(", ")}`);
  const parsed = sourceConfig.safeParse(raw);
  if (!parsed.success) throw new OpsError(parsed.error.issues[0].message);
  const c = parsed.data;
  const name = c.name ?? SOURCE_NAME[kind];

  if (kind === "files") {
    const [t] = await db.insert(timelines).values({ projectId, name }).returning();
    if (c.lanes?.length) await db.insert(sourceLanes).values(c.lanes.map((l) => ({ projectId, timelineId: t.id, name: l.name, note: l.note ?? "" })));
    return { key: `tl:${t.id}`, id: t.id, kind, name, next: c.lanes?.length ? "Upload files into the lanes on the Sources page." : "Add a lane (what the files show), then upload into it on the Sources page." };
  }
  if (kind === "weather" && (c.lat === undefined) !== (c.lng === undefined)) throw new OpsError("Weather needs both lat and lng");
  const config = kind === "weather" && c.lat !== undefined ? { lat: c.lat, lng: c.lng } : kind === "sensor_sim" && c.asset ? { asset: c.asset, surge: c.surge ?? false } : {};
  const [s] = await db.insert(sources).values({ projectId, kind, name, config, ingestKey: newIngestKey() }).returning();
  const ready = Object.keys(config).length > 0;
  if (ready) await enqueue(projectId, "poll_source", { sourceId: s.id }, { source: srcKey(s.id) });
  const next =
    kind === "screen" ? "Screen capture runs in the browser: open the project's Sources page and press Start capture."
    : kind === "webhook" ? "POST JSON events to ingest.url with the header x-ingest-key."
    : ready ? "Polling started." : kind === "weather" ? "Configure it with lat and lng to start." : "Configure it with an asset name to start.";
  return { key: kind === "screen" ? "screen" : srcKey(s.id), id: s.id, kind, name, next, ...(kind === "webhook" ? { ingest: { path: `/api/ingest/${s.id}`, key: s.ingestKey } } : {}) };
}

/** Set or change a weather or sensor source's settings, then poll it once. */
export async function configureSource(userId: string, projectId: string, sourceId: string, raw: SourceConfig) {
  await ownProject(userId, projectId);
  const [src] = z.uuid().safeParse(sourceId).success ? await db.select().from(sources).where(and(eq(sources.id, sourceId), eq(sources.projectId, projectId))) : [];
  if (!src) throw new OpsError("Source not found", 404);
  const parsed = sourceConfig.safeParse(raw);
  if (!parsed.success) throw new OpsError(parsed.error.issues[0].message);
  const c = parsed.data;
  let config: Record<string, unknown>;
  if (src.kind === "weather") {
    if (c.lat === undefined || c.lng === undefined) throw new OpsError("Weather needs lat and lng");
    config = { lat: c.lat, lng: c.lng };
  } else if (src.kind === "sensor_sim") {
    if (!c.asset) throw new OpsError("A sensor needs an asset name");
    config = { asset: c.asset, surge: c.surge ?? false };
  } else throw new OpsError("Only weather and sensor sources have settings");
  await db.update(sources).set({ config, ...(c.name ? { name: c.name } : {}) }).where(eq(sources.id, src.id));
  await enqueue(projectId, "poll_source", { sourceId: src.id }, { source: srcKey(src.id) });
}

/** Hold or release one source. Queued work is parked as "paused"; what is running finishes. */
export async function setSourcePaused(userId: string, projectId: string, key: string, paused: boolean) {
  await ownProject(userId, projectId);
  const k = parseKey(key);
  if (!k || k.type === "files") throw new OpsError("Unknown source key. Use the key from get_project.");
  if (k.type === "tl") await db.update(timelines).set({ paused }).where(and(eq(timelines.id, k.id), eq(timelines.projectId, projectId)));
  else if (k.type === "src") await db.update(sources).set({ paused }).where(and(eq(sources.id, k.id), eq(sources.projectId, projectId)));
  else {
    const held = await db.update(sources).set({ paused }).where(and(eq(sources.projectId, projectId), eq(sources.kind, "screen"))).returning({ id: sources.id });
    // Frames captured from a product page have no source row yet; the hold needs one to live on.
    if (!held.length) await db.insert(sources).values({ projectId, kind: "screen", name: "Screen share", config: {}, ingestKey: newIngestKey(), paused });
  }
  await db
    .update(jobs)
    .set({ status: paused ? "paused" : "queued", runAt: sql`now()` })
    .where(and(eq(jobs.projectId, projectId), eq(jobs.source, key), eq(jobs.status, paused ? "queued" : "paused")));
  if (!paused) after(() => drainJobs());
}

/** Put a source's failed work back in the queue with a fresh set of tries. Returns how many went back. */
export async function retrySource(userId: string, projectId: string, key: string) {
  await ownProject(userId, projectId);
  if (!parseKey(key)) throw new OpsError("Unknown source key");
  const back = await db
    .update(jobs)
    .set({ status: "queued", attempts: 0, error: null, runAt: sql`now()`, finishedAt: null })
    .where(and(eq(jobs.projectId, projectId), eq(jobs.source, key), eq(jobs.status, "failed")))
    .returning({ id: jobs.id });
  after(() => drainJobs());
  return back.length;
}

export const LEVEL_NAMES = AGENT_LEVELS.map((l) => l.name);
export const FREQUENCY_SECONDS: number[] = FREQUENCIES.map((f) => f.seconds);

/** The two dials. Level is an index or a name (Lean … Maximum); seconds is one of FREQUENCY_SECONDS. */
export async function setTune(userId: string, projectId: string, tune: { level?: number | string; seconds?: number }) {
  const p = await ownProject(userId, projectId);
  let level = p.agentLevel;
  if (typeof tune.level === "string") {
    const i = LEVEL_NAMES.findIndex((n) => n.toLowerCase() === (tune.level as string).toLowerCase());
    if (i < 0) throw new OpsError(`Unknown level. Use one of: ${LEVEL_NAMES.join(", ")}`);
    level = i;
  } else if (typeof tune.level === "number") level = Math.min(Math.max(Math.round(tune.level), 0), AGENT_LEVELS.length - 1);
  let frequency = p.frequency;
  if (tune.seconds !== undefined) {
    if (!FREQUENCY_SECONDS.includes(tune.seconds)) throw new OpsError(`seconds must be one of: ${FREQUENCY_SECONDS.join(", ")}`);
    frequency = tune.seconds;
  }
  await db.update(projects).set({ agentLevel: level, frequency }).where(eq(projects.id, projectId));
  return describeTune(level, frequency);
}

export function describeTune(level: number, seconds: number) {
  const e = estimate(level, seconds);
  return { level: agentLevel(level).name, seconds, accuracy: e.accuracy, costPerHourWhileCapturing: Number(e.cost.toFixed(2)), costPer100Photos: agentLevel(level).costPer100 };
}

/** The whole project in one read: products, sources with state, agents, tune and what to do next. */
export async function getProject(userId: string, projectId: string) {
  const p = await ownProject(userId, projectId);
  const [engine, enabled] = await Promise.all([
    loadEngine(p.id, { level: p.agentLevel, frequency: p.frequency }),
    db.select().from(projectProducts).where(eq(projectProducts.projectId, p.id)),
  ]);
  const node = (id: string) => engine.nodes.find((n) => n.id === id);
  return {
    id: p.id,
    name: p.name,
    tune: describeTune(p.agentLevel, p.frequency),
    products: enabled.flatMap((r) => {
      const prod = getProduct(r.productId);
      if (!prod) return [];
      const n = node(`p:${prod.id}`);
      return [{ id: prod.id, name: prod.name, state: n?.state ?? "waiting", rows: n?.rate ?? "0 rows", datasets: prod.observationTypes }];
    }),
    sources: engine.sources.map((s) => ({ key: s.key, name: s.name, type: s.type, state: s.state, done: s.done, total: s.total, failed: s.failed, unit: s.unit })),
    agents: engine.nodes.filter((n) => n.col === 1 || n.col === 2).map((n) => ({ name: n.label, does: n.sub, runs: n.kind, state: n.state, progress: n.rate })),
    summary: engine.summary,
  };
}

/** Rows from one dataset of a product, newest first. */
export async function getDataset(userId: string, projectId: string, productId: string, type?: string, limit = 100) {
  await ownProject(userId, projectId);
  const prod = getProduct(productId);
  if (!prod || prod.status !== "supported") throw new OpsError("Unknown data product", 404);
  const t = type ?? prod.observationTypes[0];
  if (!t || !prod.observationTypes.includes(t)) throw new OpsError(`Unknown dataset. This product has: ${prod.observationTypes.join(", ") || "none"}`);
  const [d] = await loadDatasets(projectId, [t], Math.min(Math.max(limit, 1), 1000));
  return { product: prod.id, type: t, total: d.total, rows: d.rows.map((r) => ({ observedAt: new Date(r.t).toISOString(), ...r.payload })) };
}
