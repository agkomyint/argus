import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { s3 } from "@/lib/s3";
import { getWorkspace } from "@/lib/session";

const body = z.object({ session: z.string().uuid() });

// Stop button: drop this session's frames that have not started analysis yet and delete their files.
export async function POST(request: Request) {
  const ws = await getWorkspace();
  if (!ws) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  const removed = await db
    .delete(jobs)
    .where(and(eq(jobs.projectId, ws.project.id), eq(jobs.kind, "analyze_frame"), eq(jobs.status, "queued"), sql`${jobs.payload}->>'session' = ${parsed.data.session}`))
    .returning({ payload: jobs.payload });
  await Promise.all(removed.map((r) => s3.file(String(r.payload.key)).delete().catch(() => undefined)));
  return Response.json({ discarded: removed.length });
}
