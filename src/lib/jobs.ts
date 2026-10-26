import "server-only";
import { after } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { jobs, sources, timelines } from "@/db/schema";
import { parseKey, type SourceKey } from "@/lib/source-key";

export type JobKind = "process_upload" | "poll_source" | "investigate" | "analyze_frame";
export type JobHandler = (job: { id: string; projectId: string; payload: Record<string, unknown> }) => Promise<Record<string, unknown> | void>;

const MAX_ATTEMPTS = 3;

/** Handlers are registered lazily to avoid an import cycle (handlers import the libs that enqueue). */
async function handlers(): Promise<Record<JobKind, JobHandler>> {
  return (await import("@/lib/job-handlers")).HANDLERS;
}

/** Is this source held by the person? Work for a held source is parked as "paused" until resumed. */
export async function isPaused(projectId: string, key: SourceKey) {
  const k = parseKey(key);
  if (!k) return false;
  if (k.type === "tl") return (await db.select({ p: timelines.paused }).from(timelines).where(and(eq(timelines.id, k.id), eq(timelines.projectId, projectId))))[0]?.p ?? false;
  if (k.type === "src") return (await db.select({ p: sources.paused }).from(sources).where(and(eq(sources.id, k.id), eq(sources.projectId, projectId))))[0]?.p ?? false;
  if (k.type === "screen") return (await db.select({ p: sources.paused }).from(sources).where(and(eq(sources.projectId, projectId), eq(sources.kind, "screen"), eq(sources.paused, true)))).length > 0;
  return false;
}

export async function enqueue(projectId: string, kind: JobKind, payload: Record<string, unknown>, opts: { drain?: boolean; source?: SourceKey } = {}) {
  const held = opts.source ? await isPaused(projectId, opts.source) : false;
  const [row] = await db.insert(jobs).values({ projectId, kind, payload, source: opts.source ?? null, status: held ? "paused" : "queued" }).returning();
  if (opts.drain !== false && !held) after(() => drainJobs());
  return row;
}

/** Postgres is the queue: claim one row with FOR UPDATE SKIP LOCKED so concurrent drainers never double-run a job. */
async function claim() {
  const rows = await db.execute<typeof jobs.$inferSelect & { project_id: string; run_at: Date }>(sql`
    update jobs set status = 'running', attempts = attempts + 1
    where id = (
      select id from jobs where status = 'queued' and run_at <= now()
      order by run_at, created_at limit 1 for update skip locked
    )
    returning id, project_id, kind, payload, attempts
  `);
  return rows[0] as unknown as { id: string; project_id: string; kind: JobKind; payload: Record<string, unknown>; attempts: number } | undefined;
}

/** Several workers drain at once, so lanes really do run side by side. SKIP LOCKED keeps them off each other's rows. */
const WORKERS = 3;

export async function drainJobs(max = 25) {
  // Recover jobs whose worker died mid-run.
  await db.execute(sql`update jobs set status = 'queued' where status = 'running' and run_at < now() - interval '10 minutes'`);
  const table = await handlers();
  let ran = 0;
  const worker = async () => {
  while (ran < max) {
    const job = await claim();
    if (!job) break;
    ran++;
    try {
      const result = await table[job.kind]({ id: job.id, projectId: job.project_id, payload: job.payload });
      await db.update(jobs).set({ status: "done", result: result ?? null, error: null, finishedAt: new Date() }).where(eq(jobs.id, job.id));
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      const giveUp = job.attempts >= MAX_ATTEMPTS;
      await db
        .update(jobs)
        .set(giveUp ? { status: "failed", error, finishedAt: new Date() } : { status: "queued", error, runAt: sql`now() + interval '10 seconds'` })
        .where(eq(jobs.id, job.id));
    }
  }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
  return ran;
}
