import { sql } from "drizzle-orm";
import { db } from "@/db";
import { enabledCaptureProducts, MAX_QUEUED_FRAMES } from "@/lib/capture";
import { enqueue, isPaused } from "@/lib/jobs";
import { s3 } from "@/lib/s3";
import { getWorkspace } from "@/lib/session";

const MAX_FRAME_BYTES = 2 * 1024 * 1024;
const UUID = /^[0-9a-f-]{36}$/i;

// One sampled screen-share frame (raw JPEG body). Stored briefly, queued for analysis, deleted afterwards.
export async function POST(request: Request) {
  const ws = await getWorkspace();
  if (!ws) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const session = request.headers.get("x-session") ?? "";
  if (!UUID.test(session)) return Response.json({ error: "Missing session" }, { status: 400 });
  if (request.headers.get("content-type") !== "image/jpeg") return Response.json({ error: "Send a JPEG" }, { status: 415 });

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_FRAME_BYTES) return Response.json({ error: "Frame is empty or too large" }, { status: 413 });

  if (!(await enabledCaptureProducts(ws.project.id)).length) {
    return Response.json({ error: "Turn on People count (or Apparent attribute breakdown) under Data products first" }, { status: 409 });
  }

  if (await isPaused(ws.project.id, "screen")) return Response.json({ error: "This source is paused in ARGUS" }, { status: 423 });

  const [{ n }] = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from jobs where project_id = ${ws.project.id} and kind = 'analyze_frame' and status in ('queued','running','paused')`,
  );
  if (n >= MAX_QUEUED_FRAMES) return Response.json({ error: "Queue is full", queued: n }, { status: 429 });

  // Event time comes from the capture, not from arrival, but only if the clock is plausible.
  const at = Number(request.headers.get("x-captured-at"));
  const capturedAt = Number.isFinite(at) && Math.abs(Date.now() - at) < 10 * 60_000 ? at : Date.now();

  const key = `${ws.project.id}/capture/${session}/${crypto.randomUUID()}.jpg`;
  await s3.write(key, bytes, { type: "image/jpeg" });
  await enqueue(ws.project.id, "analyze_frame", { key, session, capturedAt }, { source: "screen" });
  return Response.json({ queued: n + 1 }, { status: 202 });
}
