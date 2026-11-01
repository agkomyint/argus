import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { consumerApps } from "@/db/schema";
import type { AppConfig } from "@/lib/app-run";

/** A project's apps, oldest first. Shared replays read them too: an app is a rule, not private data. */
export async function listApps(projectId: string): Promise<AppConfig[]> {
  const rows = await db.select().from(consumerApps).where(eq(consumerApps.projectId, projectId)).orderBy(asc(consumerApps.createdAt));
  return rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, reads: r.reads, rule: r.rule, on: r.on, onTimeline: r.onTimeline }));
}
