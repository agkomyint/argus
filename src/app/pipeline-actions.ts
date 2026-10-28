"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { alerts, observations, sources } from "@/db/schema";
import { enqueue } from "@/lib/jobs";
import { getAccount, getWorkspace } from "@/lib/session";
import { srcKey } from "@/lib/source-key";

const refresh = () => revalidatePath("/studio", "layout");

/** A live lane's source, when it belongs to one of the signed-in person's projects. The studio is per project, not the cookie's. */
async function ownSource(id: string) {
  const account = await getAccount();
  if (!account || !z.uuid().safeParse(id).success) return null;
  const [src] = await db.select().from(sources).where(eq(sources.id, id));
  return src && account.projects.some((p) => p.id === src.projectId) ? src : null;
}

export async function configureSource(id: string, form: FormData) {
  const src = await ownSource(id);
  if (!src) return;
  let config: Record<string, unknown> | null = null;
  if (src.kind === "weather") {
    const lat = z.coerce.number().min(-90).max(90).safeParse(form.get("lat"));
    const lng = z.coerce.number().min(-180).max(180).safeParse(form.get("lng"));
    if (lat.success && lng.success) config = { lat: lat.data, lng: lng.data };
  } else if (src.kind === "sensor_sim") {
    const asset = String(form.get("asset") ?? "").trim();
    if (asset) config = { asset, surge: form.get("surge") === "on" };
  }
  if (!config) return;
  await db.update(sources).set({ config }).where(eq(sources.id, src.id));
  await enqueue(src.projectId, "poll_source", { sourceId: src.id }, { source: srcKey(src.id) });
  refresh();
}

export async function runSource(id: string) {
  const src = await ownSource(id);
  if (src) await enqueue(src.projectId, "poll_source", { sourceId: src.id }, { source: srcKey(src.id) });
  refresh();
}

export async function investigateObservation(observationId: string) {
  const ws = await getWorkspace();
  if (!ws) return;
  const [o] = await db.select({ id: observations.id }).from(observations).where(and(eq(observations.id, observationId), eq(observations.projectId, ws.project.id)));
  if (o) await enqueue(ws.project.id, "investigate", { observationId: o.id });
  refresh();
}

export async function reviewAlert(id: string, status: "approved" | "dismissed") {
  const ws = await getWorkspace();
  if (!ws) return;
  await db.update(alerts).set({ status, reviewedAt: new Date() }).where(and(eq(alerts.id, id), eq(alerts.projectId, ws.project.id)));
  refresh();
}

