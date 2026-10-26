import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { flowRuns, flows } from "@/db/schema";
import { getWorkspace } from "@/lib/session";

// The latest finished run's output: the flow's final product data, as JSON.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ws = await getWorkspace();
  if (!ws) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const [flow] = await db.select().from(flows).where(and(eq(flows.id, id), eq(flows.projectId, ws.project.id)));
  if (!flow) return Response.json({ error: "Not found" }, { status: 404 });
  const [run] = await db.select().from(flowRuns).where(and(eq(flowRuns.flowId, id), eq(flowRuns.status, "done"))).orderBy(desc(flowRuns.createdAt)).limit(1);
  if (!run) return Response.json({ error: "No finished run yet" }, { status: 404 });
  return Response.json({ flow: flow.name, ranAt: run.createdAt, output: run.output });
}
