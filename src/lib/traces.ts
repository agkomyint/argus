import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { traces, uploads } from "@/db/schema";
import type { TraceStep } from "@/components/studio/observatory";

/** The latest steps of a project for the Observatory window, with the file each ran on. */
export async function loadTraces(projectId: string, limit = 200): Promise<TraceStep[]> {
  const rows = await db
    .select({ t: traces, file: uploads.filename })
    .from(traces)
    .leftJoin(uploads, eq(uploads.id, traces.uploadId))
    .where(eq(traces.projectId, projectId))
    .orderBy(desc(traces.createdAt))
    .limit(limit);
  return rows.map(({ t, file }) => ({
    id: t.id,
    at: t.createdAt,
    kind: t.kind,
    name: t.name,
    model: t.model,
    status: t.status,
    ms: t.ms,
    tokensIn: t.tokensIn,
    tokensOut: t.tokensOut,
    input: t.input,
    output: t.output,
    error: t.error,
    observations: t.observationIds.length,
    subject: file ?? (t.name.startsWith("ask.") ? "Ask ARGUS" : t.name.startsWith("investigate.") ? "Investigation" : null),
  }));
}
