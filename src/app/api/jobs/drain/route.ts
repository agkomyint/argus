import { timingSafeEqual } from "node:crypto";
import { drainJobs } from "@/lib/jobs";
import { getWorkspace } from "@/lib/session";

/** A scheduler (cron, QStash) sends `Authorization: Bearer $JOBS_DRAIN_SECRET`; a signed-in person needs no token. */
function hasSecret(request: Request) {
  const secret = process.env.JOBS_DRAIN_SECRET;
  const given = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!secret || !given) return false;
  const a = Buffer.from(given), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Manual / external trigger for the Postgres-backed queue.
export async function POST(request: Request) {
  if (!hasSecret(request) && !(await getWorkspace())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ ran: await drainJobs() });
}
