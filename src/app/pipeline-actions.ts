"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { alerts, observations, sourceLanes, sources, timelines } from "@/db/schema";
import { newIngestKey } from "@/lib/connectors";
import { drainJobs, enqueue } from "@/lib/jobs";
import { seedSample } from "@/lib/sample";
import { getWorkspace } from "@/lib/session";
import { srcKey } from "@/lib/source-key";

const refresh = () => revalidatePath("/dashboard", "layout");

export async function createTimeline(form: FormData) {
  const ws = await getWorkspace();
  const name = String(form.get("name") ?? "").trim().slice(0, 60);
  if (!ws || !name) return;
  await db.insert(timelines).values({ projectId: ws.project.id, name });
  refresh();
}

export async function addLane(timelineId: string, form: FormData) {
  const ws = await getWorkspace();
  const name = String(form.get("name") ?? "").trim().slice(0, 60);
  const note = String(form.get("note") ?? "").trim().slice(0, 300);
  if (!ws || !name) return;
  const [t] = await db.select({ id: timelines.id }).from(timelines).where(and(eq(timelines.id, timelineId), eq(timelines.projectId, ws.project.id)));
  if (!t) return;
  await db.insert(sourceLanes).values({ projectId: ws.project.id, timelineId: t.id, name, note });
  refresh();
}

export async function deleteLane(id: string) {
  const ws = await getWorkspace();
  if (!ws) return;
  await db.delete(sourceLanes).where(and(eq(sourceLanes.id, id), eq(sourceLanes.projectId, ws.project.id)));
  refresh();
}

export async function deleteTimeline(id: string) {
  const ws = await getWorkspace();
  if (!ws) return;
  await db.delete(timelines).where(and(eq(timelines.id, id), eq(timelines.projectId, ws.project.id)));
  refresh();
}

/** Adding only registers the source. Its settings come afterwards (configureSource, uploads, capture). */
export async function addSource(kind: "files" | "screen" | "weather" | "sensor_sim" | "webhook", form: FormData) {
  const ws = await getWorkspace();
  if (!ws) return;
  const fallback = { files: "Files", screen: "Screen share", weather: "Weather feed", sensor_sim: "Sensor", webhook: "Webhook" }[kind];
  const name = String(form.get("name") ?? "").trim().slice(0, 60) || fallback;
  if (kind === "files") await db.insert(timelines).values({ projectId: ws.project.id, name });
  else await db.insert(sources).values({ projectId: ws.project.id, kind, name, config: {}, ingestKey: newIngestKey() });
  refresh();
}

export async function configureSource(id: string, form: FormData) {
  const ws = await getWorkspace();
  if (!ws) return;
  const [src] = await db.select().from(sources).where(and(eq(sources.id, id), eq(sources.projectId, ws.project.id)));
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
  await enqueue(ws.project.id, "poll_source", { sourceId: src.id }, { source: srcKey(src.id) });
  refresh();
}

export async function createSource(kind: "weather" | "sensor_sim" | "webhook", form?: FormData) {
  const ws = await getWorkspace();
  if (!ws) return;
  const asset = String(form?.get("asset") ?? "").trim() || undefined;
  const name = String(form?.get("name") ?? "").trim();
  let config: Record<string, unknown> = {};
  let label = name;
  if (kind === "weather") {
    const lat = z.coerce.number().min(-90).max(90).safeParse(form?.get("lat"));
    const lng = z.coerce.number().min(-180).max(180).safeParse(form?.get("lng"));
    if (!lat.success || !lng.success) return;
    config = { lat: lat.data, lng: lng.data, asset };
    label ||= "Weather (Open-Meteo)";
  } else if (kind === "sensor_sim") {
    config = { asset, surge: form?.get("surge") === "on" };
    label ||= "Simulated vibration sensor";
  } else label ||= "Webhook";
  const [src] = await db.insert(sources).values({ projectId: ws.project.id, kind, name: label, config, ingestKey: newIngestKey() }).returning();
  if (kind !== "webhook") await enqueue(ws.project.id, "poll_source", { sourceId: src.id }, { source: srcKey(src.id) });
  refresh();
}

export async function runSource(id: string) {
  const ws = await getWorkspace();
  if (!ws) return;
  const [src] = await db.select({ id: sources.id }).from(sources).where(and(eq(sources.id, id), eq(sources.projectId, ws.project.id)));
  if (src) await enqueue(ws.project.id, "poll_source", { sourceId: src.id }, { source: srcKey(src.id) });
  refresh();
}

export async function deleteSource(id: string) {
  const ws = await getWorkspace();
  if (!ws) return;
  await db.delete(sources).where(and(eq(sources.id, id), eq(sources.projectId, ws.project.id)));
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

export async function runQueueNow() {
  const ws = await getWorkspace();
  if (!ws) return;
  await drainJobs();
  refresh();
}

/** One click to a populated project. See src/lib/sample.ts. */
export async function loadSampleData() {
  const ws = await getWorkspace();
  if (!ws) return;
  await seedSample(ws.project.id);
  refresh();
}
