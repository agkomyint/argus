"use server";

import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { projectProducts, projects, sources, uploads } from "@/db/schema";
import { s3 } from "@/lib/s3";
import { newIngestKey } from "@/lib/connectors";
import { enqueue } from "@/lib/jobs";
import { upsertAsset } from "@/lib/observations";
import { AGENT_LEVELS, VOLUMES } from "@/lib/agent-levels";
import { agentConfigSchema, lanesSchema, resolveConfig, resolveLanes, DEFAULT_CONFIG, type AgentId } from "@/lib/agent-config";
import { getSolution } from "@/lib/solutions";
import { PROJECT_COOKIE, getAccount, getWorkspace } from "@/lib/session";
import { getProduct } from "@/products";
import { srcKey } from "@/lib/source-key";

const createSchema = z.object({
  product: z.string(),
  name: z.string().trim().min(2, "Give the project a name").max(80),
  assets: z.string().trim().max(300),
  weather: z.boolean(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  sensor: z.boolean(),
});

export type ActionState = { error?: string } | undefined;

async function setActiveProject(id: string) {
  (await cookies()).set(PROJECT_COOKIE, id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
}

/** Create a project for a chosen data product, optionally connecting the suggested sources, then open it. */
export async function createProject(_prev: ActionState, form: FormData): Promise<ActionState> {
  const account = await getAccount();
  if (!account) return { error: "You are signed out" };
  const parsed = createSchema.safeParse({
    product: form.get("product"),
    name: form.get("name"),
    assets: form.get("assets") ?? "",
    weather: form.get("weather") === "on",
    lat: form.get("lat") || undefined,
    lng: form.get("lng") || undefined,
    sensor: form.get("sensor") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const solution = getSolution(parsed.data.product);
  if (!solution?.live) return { error: "That data product is not available yet" };
  if (parsed.data.weather && (parsed.data.lat === undefined || parsed.data.lng === undefined)) return { error: "Enter a latitude and longitude for the weather feed" };

  const [project] = await db.insert(projects).values({ userId: account.user.id, name: parsed.data.name, kind: solution.kind, product: solution.id }).returning();
  const names = [...new Set(parsed.data.assets.split(",").map((n) => n.trim()).filter(Boolean))].slice(0, 12);
  for (const n of names) await upsertAsset(project.id, n, { kind: "bridge pier", lat: parsed.data.lat ?? null, lng: parsed.data.lng ?? null });

  if (parsed.data.weather) {
    const [src] = await db.insert(sources).values({ projectId: project.id, kind: "weather", name: "Weather (Open-Meteo)", config: { lat: parsed.data.lat, lng: parsed.data.lng }, ingestKey: newIngestKey() }).returning();
    await enqueue(project.id, "poll_source", { sourceId: src.id }, { source: srcKey(src.id) });
  }
  if (parsed.data.sensor) {
    const [src] = await db.insert(sources).values({ projectId: project.id, kind: "sensor_sim", name: "Simulated vibration sensor", config: { asset: names[0], surge: false }, ingestKey: newIngestKey() }).returning();
    await enqueue(project.id, "poll_source", { sourceId: src.id }, { source: srcKey(src.id) });
  }
  await setActiveProject(project.id);
  redirect("/dashboard");
}

/** Start a general project and turn on the catalog data products picked on the form. */
export async function createGeneralProject(_prev: ActionState, form: FormData): Promise<ActionState> {
  const account = await getAccount();
  if (!account) return { error: "You are signed out" };
  const name = z.string().trim().min(2, "Give the project a name").max(80).safeParse(form.get("name"));
  if (!name.success) return { error: name.error.issues[0].message };
  const ids = [...new Set(form.getAll("product").map(String))].filter((id) => getProduct(id)?.status === "supported");
  if (!ids.length) return { error: "Pick at least one data product" };
  const [project] = await db.insert(projects).values({ userId: account.user.id, name: name.data, kind: "other" }).returning();
  await db.insert(projectProducts).values(ids.map((productId) => ({ projectId: project.id, productId })));
  await setActiveProject(project.id);
  // From the slideshow, land on the new slide; elsewhere, open the dashboard.
  redirect(form.get("then") === "projects" ? "/projects" : "/dashboard");
}

/** Save one agent's settings. Validated against the bounds in agent-config.ts, then merged into the stored config. */
export async function saveAgentConfig(agent: AgentId, values: unknown): Promise<{ error?: string }> {
  const ws = await getWorkspace();
  if (!ws || !(agent in DEFAULT_CONFIG)) return { error: "Not allowed" };
  const parsed = agentConfigSchema.shape[agent].safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid settings" };
  if (agent === "analysis") {
    const a = parsed.data as { mediumAt: number; highAt: number };
    if (a.highAt <= a.mediumAt) return { error: "High needs a higher score than Medium" };
  }
  const next = { ...resolveConfig(ws.project.agentConfig), lanes: resolveLanes(ws.project.agentConfig), [agent]: parsed.data };
  await db.update(projects).set({ agentConfig: next }).where(eq(projects.id, ws.project.id));
  revalidatePath("/dashboard", "layout");
  return {};
}

export async function resetAgentConfig(agent: AgentId) {
  const ws = await getWorkspace();
  if (!ws || !(agent in DEFAULT_CONFIG)) return;
  const next = { ...resolveConfig(ws.project.agentConfig), lanes: resolveLanes(ws.project.agentConfig), [agent]: DEFAULT_CONFIG[agent] };
  await db.update(projects).set({ agentConfig: next }).where(eq(projects.id, ws.project.id));
  revalidatePath("/dashboard", "layout");
}

export async function saveLanes(values: unknown): Promise<{ error?: string }> {
  const ws = await getWorkspace();
  if (!ws) return { error: "Not allowed" };
  const parsed = lanesSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid lanes" };
  const next = { ...resolveConfig(ws.project.agentConfig), lanes: parsed.data };
  await db.update(projects).set({ agentConfig: next }).where(eq(projects.id, ws.project.id));
  revalidatePath("/dashboard", "layout");
  return {};
}

/**
 * Delete a project the user owns. The person must type the project name to confirm.
 * Stored files are removed from the bucket first; every table that hangs off the project cascades.
 */
/**
 * Show a project on /explore, or take it down. The owner agrees in the share dialog first; every share
 * makes a new link, so stopping and sharing again retires the old one.
 */
export async function setProjectShared(id: string, on: boolean): Promise<{ slug?: string | null; error?: string }> {
  const account = await getAccount();
  if (!account?.projects.some((p) => p.id === id)) return { error: "Project not found" };
  const slug = on ? randomBytes(9).toString("base64url") : null;
  await db.update(projects).set({ shareSlug: slug, sharedAt: on ? new Date() : null }).where(and(eq(projects.id, id), eq(projects.userId, account.user.id)));
  revalidatePath("/", "layout");
  return { slug };
}

export async function deleteProject(id: string, confirmName: string): Promise<{ error?: string }> {
  const account = await getAccount();
  const project = account?.projects.find((p) => p.id === id);
  if (!account || !project) return { error: "Project not found" };
  if (confirmName.trim() !== project.name) return { error: "Type the project name exactly to confirm" };

  const files = await db.select({ key: uploads.key }).from(uploads).where(eq(uploads.projectId, id));
  await Promise.all(files.map((f) => s3.delete(f.key).catch(() => {})));
  await db.delete(projects).where(and(eq(projects.id, id), eq(projects.userId, account.user.id)));

  const jar = await cookies();
  if (jar.get(PROJECT_COOKIE)?.value === id) jar.delete(PROJECT_COOKIE);
  revalidatePath("/", "layout");
  return {};
}

/** Open a project from the chooser, then land on its overview. */
const OPEN_TO = ["/dashboard", "/dashboard/sources", "/dashboard/agents", "/dashboard/flows", "/dashboard/replay"] as const;

/** Open a project, optionally straight onto one of its pages (only the ones listed above). */
export async function openProject(id: string, to: (typeof OPEN_TO)[number] = "/dashboard") {
  const account = await getAccount();
  if (!account || !account.projects.some((p) => p.id === id)) return;
  await setActiveProject(id);
  redirect(OPEN_TO.includes(to) ? to : "/dashboard");
}

export async function setProductEnabled(productId: string, enabled: boolean) {
  const ws = await getWorkspace();
  const product = getProduct(productId);
  if (!ws || !product || product.status !== "supported") return;

  if (enabled) {
    await db.insert(projectProducts).values({ projectId: ws.project.id, productId }).onConflictDoNothing();
  } else {
    await db.delete(projectProducts).where(and(eq(projectProducts.projectId, ws.project.id), eq(projectProducts.productId, productId)));
  }
  revalidatePath("/dashboard", "layout");
}

/** Save the cost vs accuracy preset and expected volume for this project's agents. */
export async function setAgentSetup(level: number, monthlyPhotos: number) {
  const ws = await getWorkspace();
  if (!ws) return;
  const safe = { agentLevel: Math.min(Math.max(Math.round(level), 0), AGENT_LEVELS.length - 1), monthlyPhotos: VOLUMES.includes(monthlyPhotos as (typeof VOLUMES)[number]) ? monthlyPhotos : ws.project.monthlyPhotos };
  await db.update(projects).set(safe).where(eq(projects.id, ws.project.id));
  revalidatePath("/dashboard", "layout");
}
