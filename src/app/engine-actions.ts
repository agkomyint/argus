"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/db";
import { jobs, projects, sources, timelines } from "@/db/schema";
import { AGENT_LEVELS } from "@/lib/agent-levels";
import { newIngestKey } from "@/lib/connectors";
import { drainJobs } from "@/lib/jobs";
import { getAccount, getWorkspace } from "@/lib/session";
import { parseKey } from "@/lib/source-key";
import { FREQUENCIES } from "@/lib/tune";

const refresh = () => {
  revalidatePath("/dashboard", "layout");
  revalidatePath("/projects");
};

/** Hold or release one source. Queued work is parked as "paused"; what is running finishes. */
export async function setSourcePaused(key: string, paused: boolean) {
  const ws = await getWorkspace();
  const k = parseKey(key);
  if (!ws || !k) return;
  const pid = ws.project.id;
  if (k.type === "tl") await db.update(timelines).set({ paused }).where(and(eq(timelines.id, k.id), eq(timelines.projectId, pid)));
  else if (k.type === "src") await db.update(sources).set({ paused }).where(and(eq(sources.id, k.id), eq(sources.projectId, pid)));
  else if (k.type === "screen") {
    const held = await db.update(sources).set({ paused }).where(and(eq(sources.projectId, pid), eq(sources.kind, "screen"))).returning({ id: sources.id });
    // Frames captured from a product page have no source row yet; the hold needs one to live on.
    if (!held.length) await db.insert(sources).values({ projectId: pid, kind: "screen", name: "Screen share", config: {}, ingestKey: newIngestKey(), paused });
  }
  await db
    .update(jobs)
    .set({ status: paused ? "paused" : "queued", runAt: sql`now()` })
    .where(and(eq(jobs.projectId, pid), eq(jobs.source, key), eq(jobs.status, paused ? "queued" : "paused")));
  if (!paused) after(() => drainJobs());
  refresh();
}

/** Put a source's failed work back in the queue with a fresh set of tries. */
export async function retrySource(key: string) {
  const ws = await getWorkspace();
  if (!ws || !parseKey(key)) return;
  await db
    .update(jobs)
    .set({ status: "queued", attempts: 0, error: null, runAt: sql`now()`, finishedAt: null })
    .where(and(eq(jobs.projectId, ws.project.id), eq(jobs.source, key), eq(jobs.status, "failed")));
  after(() => drainJobs());
  refresh();
}

/** The two dials: how careful the agents are (level) and how often they look (seconds between frames). */
export async function setTune(level: number, seconds: number) {
  const ws = await getWorkspace();
  if (!ws) return;
  const agentLevel = Math.min(Math.max(Math.round(level), 0), AGENT_LEVELS.length - 1);
  const frequency = FREQUENCIES.some((f) => f.seconds === seconds) ? seconds : ws.project.frequency;
  await db.update(projects).set({ agentLevel, frequency }).where(eq(projects.id, ws.project.id));
  refresh();
}

/** Add a source from a project slide. Adding only registers it; setting it up happens on the source. */
export async function addSourceTo(projectId: string, kind: "files" | "screen" | "weather" | "sensor_sim" | "webhook"): Promise<{ error?: string }> {
  const account = await getAccount();
  if (!account?.projects.some((p) => p.id === projectId)) return { error: "Project not found" };
  const name = { files: "Files", screen: "Screen share", weather: "Weather feed", sensor_sim: "Sensor", webhook: "Webhook" }[kind];
  if (!name) return { error: "Unknown source" };
  if (kind === "files") await db.insert(timelines).values({ projectId, name });
  else await db.insert(sources).values({ projectId, kind, name, config: {}, ingestKey: newIngestKey() });
  refresh();
  return {};
}
