import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { flows } from "@/db/schema";
import { graphSchema, starterGraph, validateGraph } from "@/lib/flow/types";
import { getWorkspace } from "@/lib/session";

export async function GET() {
  const ws = await getWorkspace();
  if (!ws) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db.select({ id: flows.id, name: flows.name, updatedAt: flows.updatedAt }).from(flows).where(eq(flows.projectId, ws.project.id)).orderBy(desc(flows.updatedAt));
  return Response.json({ flows: rows });
}

// Create a flow. Body: { name, graph? } (graph omitted = the starter example). See docs/FLOWS.md.
export async function POST(request: Request) {
  const ws = await getWorkspace();
  if (!ws) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { name?: string; graph?: unknown } | null;
  const parsed = body?.graph === undefined ? { success: true as const, data: starterGraph() } : graphSchema.safeParse(body.graph);
  if (!parsed.success) return Response.json({ error: "Invalid graph", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  const problem = validateGraph(parsed.data);
  if (problem) return Response.json({ error: problem }, { status: 400 });
  const [row] = await db.insert(flows).values({ projectId: ws.project.id, name: body?.name?.trim().slice(0, 60) || "Untitled flow", graph: parsed.data }).returning();
  return Response.json({ id: row.id }, { status: 201 });
}
