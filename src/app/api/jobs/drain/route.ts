import { drainJobs } from "@/lib/jobs";
import { getWorkspace } from "@/lib/session";

// Manual / external trigger for the Postgres-backed queue. A scheduler (cron, QStash) can call this too.
export async function POST() {
  const ws = await getWorkspace();
  if (!ws) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ ran: await drainJobs() });
}
