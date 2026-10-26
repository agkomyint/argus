import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { flows } from "@/db/schema";
import { graphSchema, validateGraph } from "@/lib/flow/types";
import { getWorkspace } from "@/lib/session";

// The flow as plain JSON, for people and AI agents that edit it outside the editor. See docs/FLOWS.md.
async function load(id: string) {
  const ws = await getWorkspace();
  if (!ws) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  const [flow] = await db.select().from(flows).where(and(eq(flows.id, id), eq(flows.projectId, ws.project.id)));
  return flow ? { flow } : { error: Response.json({ error: "Not found" }, { status: 404 }) };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await load((await params).id);
  if (r.error) return r.error;
  return Response.json({ id: r.flow.id, name: r.flow.name, graph: r.flow.graph, updatedAt: r.flow.updatedAt });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await load((await params).id);
  if (r.error) return r.error;
  const body = (await request.json().catch(() => null)) as { name?: string; graph?: unknown } | null;
  const parsed = graphSchema.safeParse(body?.graph);
  if (!parsed.success) return Response.json({ error: "Invalid graph", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  const problem = validateGraph(parsed.data);
  if (problem) return Response.json({ error: problem }, { status: 400 });
  await db.update(flows).set({ graph: parsed.data, name: body?.name?.trim().slice(0, 60) || r.flow.name, updatedAt: new Date() }).where(eq(flows.id, r.flow.id));
  return Response.json({ ok: true });
}
