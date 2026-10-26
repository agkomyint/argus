import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import { enqueue } from "@/lib/jobs";
import { s3 } from "@/lib/s3";
import { getWorkspace } from "@/lib/session";
import { tlKey } from "@/lib/source-key";

// Step 2: after the browser PUT, confirm the object really exists and record its true size.
export async function POST(_req: Request, ctx: RouteContext<"/api/uploads/[id]/complete">) {
  const { id } = await ctx.params;
  const ws = await getWorkspace();
  if (!ws) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [row] = await db
    .select()
    .from(uploads)
    .where(and(eq(uploads.id, id), eq(uploads.projectId, ws.project.id)));
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });

  const file = s3.file(row.key);
  if (!(await file.exists())) return Response.json({ error: "File was not uploaded" }, { status: 409 });

  const [updated] = await db.update(uploads).set({ status: "ready", size: (await file.stat()).size }).where(eq(uploads.id, row.id)).returning();
  await enqueue(ws.project.id, "process_upload", { uploadId: updated.id }, { source: updated.timelineId ? tlKey(updated.timelineId) : "files" });
  return Response.json({ upload: updated });
}
