import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import { presignDownload, s3 } from "@/lib/s3";
import { getWorkspace } from "@/lib/session";

async function findOwned(id: string) {
  const ws = await getWorkspace();
  if (!ws) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  const [row] = await db
    .select()
    .from(uploads)
    .where(and(eq(uploads.id, id), eq(uploads.projectId, ws.project.id)));
  if (!row) return { error: Response.json({ error: "Not found" }, { status: 404 }) };
  return { row };
}

export async function GET(_req: Request, ctx: RouteContext<"/api/uploads/[id]">) {
  const { id } = await ctx.params;
  const { row, error } = await findOwned(id);
  if (error) return error;
  if (row.status !== "ready") return Response.json({ error: "Upload not finished" }, { status: 409 });
  return Response.redirect(presignDownload(row.key), 302);
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/uploads/[id]">) {
  const { id } = await ctx.params;
  const { row, error } = await findOwned(id);
  if (error) return error;
  await s3.delete(row.key).catch(() => {});
  await db.delete(uploads).where(eq(uploads.id, row.id));
  return Response.json({ ok: true });
}
