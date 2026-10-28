"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/db";
import { jobs, sources, timelines } from "@/db/schema";
import { newIngestKey } from "@/lib/connectors";
import { drainJobs } from "@/lib/jobs";
import { getWorkspace } from "@/lib/session";
import { parseKey } from "@/lib/source-key";

const refresh = () => {
  revalidatePath("/studio", "layout");
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

