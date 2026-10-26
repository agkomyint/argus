import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { sourceLanes, uploads } from "@/db/schema";
import { presignUpload } from "@/lib/s3";
import { getWorkspace } from "@/lib/session";
import { MAX_UPLOAD_BYTES, isAllowedFile, safeName } from "@/lib/uploads";

const body = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(100),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  laneId: z.string().uuid(),
});

export async function GET() {
  const ws = await getWorkspace();
  if (!ws) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db.select().from(uploads).where(eq(uploads.projectId, ws.project.id)).orderBy(desc(uploads.createdAt));
  return Response.json({ uploads: rows });
}

// Step 1 of an upload: register it and hand back a presigned PUT URL for the browser.
export async function POST(request: Request) {
  const ws = await getWorkspace();
  if (!ws) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { filename, contentType, size } = parsed.data;
  const [lane] = await db.select().from(sourceLanes).where(and(eq(sourceLanes.id, parsed.data.laneId), eq(sourceLanes.projectId, ws.project.id)));
  if (!lane) return Response.json({ error: "Files go into a lane. Add a lane first." }, { status: 400 });
  const timelineId = lane.timelineId;
  if (!isAllowedFile(filename)) return Response.json({ error: "This file type is not supported" }, { status: 415 });

  const id = crypto.randomUUID();
  const key = `${ws.project.id}/${id}/${safeName(filename)}`;
  const [row] = await db
    .insert(uploads)
    .values({ id, projectId: ws.project.id, userId: ws.user.id, key, filename, contentType, size, timelineId, laneId: lane.id })
    .returning();

  return Response.json({ upload: row, url: presignUpload(key, { contentType }) }, { status: 201 });
}
