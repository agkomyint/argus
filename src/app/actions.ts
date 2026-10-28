"use server";

import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { SHARED_LIST_TAG, sharedTag } from "@/lib/explore";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { LANE_ANALYZERS, projectProducts, projects, sources, uploads } from "@/db/schema";
import { s3 } from "@/lib/s3";
import { dropKeptFrames } from "@/lib/capture";
import { newIngestKey } from "@/lib/connectors";
import { enqueue } from "@/lib/jobs";
import { upsertAsset } from "@/lib/observations";
import { getSolution } from "@/lib/solutions";
import { PROJECT_COOKIE_OPTIONS } from "@/lib/project-cookie";
import { PROJECT_COOKIE, getAccount, getWorkspace } from "@/lib/session";
import { getProduct } from "@/products";
import { applySetupPlan } from "@/lib/setup";
import { linkProduct, unlinkProduct } from "@/lib/lane-links";
import { withTrace } from "@/lib/trace";
import { cleanPlan, planProblems, type SetupPlan } from "@/lib/setup-rules";
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
  (await cookies()).set(PROJECT_COOKIE, id, PROJECT_COOKIE_OPTIONS);
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
  redirect(`/studio/${project.id}`);
}

/** Start a general project and turn on the catalog data products picked on the form. */
const planSchema = z.object({
  lanes: z.array(z.object({ name: z.string().max(60), note: z.string().max(300), analyzer: z.enum(LANE_ANALYZERS), feeds: z.array(z.string()).max(20) })).max(10),
});

/** Undefined when the form has no plan (picked by hand), null when it has one that does not parse. */
function parsePlan(v: FormDataEntryValue | null): SetupPlan | null | undefined {
  if (typeof v !== "string" || !v) return undefined;
  try {
    const r = planSchema.safeParse(JSON.parse(v));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export async function createGeneralProject(_prev: ActionState, form: FormData): Promise<ActionState> {
  const account = await getAccount();
  if (!account) return { error: "You are signed out" };
  const name = z.string().trim().min(2, "Give the project a name").max(80).safeParse(form.get("name"));
  if (!name.success) return { error: name.error.issues[0].message };
  const ids = [...new Set(form.getAll("product").map(String))].filter((id) => getProduct(id)?.status === "supported");
  if (!ids.length) return { error: "Pick at least one data product" };
  // An AI setup plan the person confirmed. Checked by code before anything is created.
  const plan = parsePlan(form.get("plan"));
  if (plan === null) return { error: "The lane plan could not be read. Plan the lanes again." };
  const problem = plan && planProblems(cleanPlan(plan), ids)[0];
  if (problem) return { error: problem };
  const description = String(form.get("description") ?? "").trim().slice(0, 280);
  const [project] = await db.insert(projects).values({ userId: account.user.id, name: name.data, description, kind: "other" }).returning();
  await db.insert(projectProducts).values(ids.map((productId) => ({ projectId: project.id, productId })));
  if (plan) await withTrace({ projectId: project.id, userId: account.user.id }, () => applySetupPlan(project.id, account.user.id, plan, ids));
  await setActiveProject(project.id);
  // From the slideshow, land on the new slide; elsewhere, open the studio.
  redirect(form.get("then") === "projects" ? "/projects" : `/studio/${project.id}`);
}

/** Rename a project or change its description. Only the owner can. */
export async function updateProjectDetails(id: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const account = await getAccount();
  const project = account?.projects.find((p) => p.id === id);
  if (!project) return { error: "Not allowed" };
  const name = z.string().trim().min(2, "Give the project a name").max(80).safeParse(form.get("name"));
  if (!name.success) return { error: name.error.issues[0].message };
  const description = String(form.get("description") ?? "").trim().slice(0, 280);
  await db.update(projects).set({ name: name.data, description }).where(eq(projects.id, id));
  if (project.shareSlug) { updateTag(SHARED_LIST_TAG); updateTag(sharedTag(project.shareSlug)); }
  revalidatePath("/projects");
  revalidatePath("/studio", "layout");
  return {};
}

/**
 * Show a project on /explore, or take it down. The owner agrees in the share dialog first; every share
 * makes a new link, so stopping and sharing again retires the old one. Stopping also stops showing media
 * and deletes any kept screen frames.
 */
export async function setProjectShared(id: string, on: boolean, media = false): Promise<{ slug?: string | null; error?: string }> {
  const account = await getAccount();
  const project = account?.projects.find((p) => p.id === id);
  if (!account || !project) return { error: "Project not found" };
  const slug = on ? randomBytes(9).toString("base64url") : null;
  await db.update(projects).set({ shareSlug: slug, sharedAt: on ? new Date() : null, shareMedia: on && media }).where(and(eq(projects.id, id), eq(projects.userId, account.user.id)));
  if (!on || !media) await dropKeptFrames(id);
  // The old link's cached replay goes at once, so a project taken down is never served from the cache.
  if (project.shareSlug) updateTag(sharedTag(project.shareSlug));
  updateTag(SHARED_LIST_TAG);
  revalidatePath("/", "layout");
  return { slug };
}

/** Show or hide media on a public project. Hiding deletes the screen frames kept for it; uploaded files stay private in the project. */
export async function setProjectShareMedia(id: string, on: boolean): Promise<{ error?: string }> {
  const account = await getAccount();
  const project = account?.projects.find((p) => p.id === id);
  if (!account || !project) return { error: "Project not found" };
  if (on && !project.shareSlug) return { error: "Share the project first" };
  await db.update(projects).set({ shareMedia: on }).where(and(eq(projects.id, id), eq(projects.userId, account.user.id)));
  if (!on) await dropKeptFrames(id);
  if (project.shareSlug) { updateTag(SHARED_LIST_TAG); updateTag(sharedTag(project.shareSlug)); }
  revalidatePath("/", "layout");
  return {};
}

/**
 * Delete a project the user owns. The person must type the project name to confirm.
 * Stored files are removed from the bucket first; every table that hangs off the project cascades.
 */
export async function deleteProject(id: string, confirmName: string): Promise<{ error?: string }> {
  const account = await getAccount();
  const project = account?.projects.find((p) => p.id === id);
  if (!account || !project) return { error: "Project not found" };
  if (confirmName.trim() !== project.name) return { error: "Type the project name exactly to confirm" };

  const files = await db.select({ key: uploads.key }).from(uploads).where(eq(uploads.projectId, id));
  await Promise.all(files.map((f) => s3.delete(f.key).catch(() => {})));
  await dropKeptFrames(id);
  await db.delete(projects).where(and(eq(projects.id, id), eq(projects.userId, account.user.id)));
  if (project.shareSlug) { updateTag(SHARED_LIST_TAG); updateTag(sharedTag(project.shareSlug)); }

  const jar = await cookies();
  if (jar.get(PROJECT_COOKIE)?.value === id) jar.delete(PROJECT_COOKIE);
  revalidatePath("/", "layout");
  return {};
}

/** Open a project from the chooser in its studio. */
export async function openProject(id: string) {
  const account = await getAccount();
  if (!account || !account.projects.some((p) => p.id === id)) return;
  await setActiveProject(id);
  redirect(`/studio/${id}`);
}

export async function setProductEnabled(productId: string, enabled: boolean) {
  const ws = await getWorkspace();
  const product = getProduct(productId);
  if (!ws || !product || product.status !== "supported") return;

  if (enabled) {
    await db.insert(projectProducts).values({ projectId: ws.project.id, productId }).onConflictDoNothing();
    await linkProduct(ws.project.id, productId);
  } else {
    await db.delete(projectProducts).where(and(eq(projectProducts.projectId, ws.project.id), eq(projectProducts.productId, productId)));
    await unlinkProduct(ws.project.id, productId);
  }
  revalidatePath("/studio", "layout");
}

