import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import { isPaused } from "@/lib/jobs";
import { getWorkspace } from "@/lib/session";
import { tlKey } from "@/lib/source-key";
import { withTrace, writeTrace } from "@/lib/trace";
import { storeVideoFrame } from "@/sources/video";
import { isVideoFile } from "@/sources/video-plan";

const MAX_FRAME_BYTES = 2 * 1024 * 1024;

// Frames of an uploaded video, sampled in the browser. A JPEG body is one frame (x-at-ms says where in
// the clip); a JSON body is the browser's report once it is done, recorded in the observatory as a code step.
export async function POST(request: Request, ctx: RouteContext<"/api/uploads/[id]/frames">) {
  const { id } = await ctx.params;
  const ws = await getWorkspace();
  if (!ws) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const [up] = await db.select().from(uploads).where(and(eq(uploads.id, id), eq(uploads.projectId, ws.project.id)));
  if (!up || up.status !== "ready") return Response.json({ error: "Not found" }, { status: 404 });
  if (!isVideoFile(up.filename)) return Response.json({ error: "Not a video" }, { status: 415 });

  return withTrace({ projectId: up.projectId, userId: ws.user.id, uploadId: up.id }, async () => {
    if (request.headers.get("content-type")?.startsWith("application/json")) {
      const r = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const num = (k: string) => (Number.isFinite(Number(r[k])) ? Number(r[k]) : null);
      await writeTrace({
        kind: "code",
        name: "video.sample_frames",
        status: r.error ? "error" : "ok",
        ms: num("ms") ?? 0,
        input: { file: up.filename, durationMs: num("durationMs"), width: num("width"), height: num("height"), everyMs: num("everyMs"), decoder: String(r.decoder ?? "browser") },
        output: { frames: num("frames"), ranIn: "the uploader's browser" },
        error: r.error ? String(r.error).slice(0, 500) : null,
      });
      return Response.json({ ok: true });
    }

    if (request.headers.get("content-type") !== "image/jpeg") return Response.json({ error: "Send a JPEG" }, { status: 415 });
    const atMs = Number(request.headers.get("x-at-ms"));
    if (!Number.isInteger(atMs) || atMs < 0) return Response.json({ error: "Missing x-at-ms" }, { status: 400 });
    if (await isPaused(up.projectId, up.timelineId ? tlKey(up.timelineId) : "files")) return Response.json({ error: "This source is paused in ARGUS" }, { status: 423 });
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_FRAME_BYTES) return Response.json({ error: "Frame is empty or too large" }, { status: 413 });

    const stored = await storeVideoFrame(up, atMs, bytes);
    if (!stored) return Response.json({ error: "This video already has the most frames ARGUS samples" }, { status: 429 });
    return Response.json(stored, { status: 202 });
  });
}
