"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { flowRuns, flows, observations, projectProducts, sourceLanes, sources, timelines } from "@/db/schema";
import { getProduct } from "@/products";
import { runGraph } from "@/lib/flow/engine";
import { generateGraph } from "@/lib/flow/generate";
import { graphSchema, starterGraph, validateGraph } from "@/lib/flow/types";
import { getWorkspace } from "@/lib/session";

async function owned(id: string) {
  const ws = await getWorkspace();
  if (!ws) return null;
  const [flow] = await db.select().from(flows).where(and(eq(flows.id, id), eq(flows.projectId, ws.project.id)));
  return flow ? { ws, flow } : null;
}

export async function createFlow(formData: FormData) {
  const ws = await getWorkspace();
  if (!ws) return;
  const name = String(formData.get("name") ?? "").trim().slice(0, 60) || "Untitled flow";
  const blank = formData.get("blank") === "1";
  await db.insert(flows).values({ projectId: ws.project.id, name, graph: blank ? { nodes: [], edges: [] } : starterGraph() });
  redirect(`/studio/${ws.project.id}`);
}

export async function saveFlow(id: string, name: string, graph: unknown): Promise<{ error?: string }> {
  const o = await owned(id);
  if (!o) return { error: "Not allowed" };
  const parsed = graphSchema.safeParse(graph);
  if (!parsed.success) return { error: "That graph is not valid" };
  const problem = validateGraph(parsed.data);
  if (problem) return { error: problem };
  await db.update(flows).set({ name: name.trim().slice(0, 60) || o.flow.name, graph: parsed.data, updatedAt: new Date() }).where(eq(flows.id, id));
  revalidatePath("/studio", "layout");
  return {};
}

export async function deleteFlow(id: string) {
  const o = await owned(id);
  if (!o) return;
  await db.delete(flows).where(eq(flows.id, id));
  revalidatePath("/studio", "layout");
  redirect(`/studio/${o.ws.project.id}`);
}

/** Run the SAVED graph, so what ran is always what is stored. */
export async function runFlow(id: string): Promise<{ error?: string }> {
  const o = await owned(id);
  if (!o) return { error: "Not allowed" };
  const parsed = graphSchema.safeParse(o.flow.graph);
  if (!parsed.success) return { error: "The saved graph is not valid" };
  try {
    const { trace, output } = await runGraph(parsed.data, { projectId: o.ws.project.id, flowId: id });
    const failed = trace.find((t) => t.error);
    await db.insert(flowRuns).values({ flowId: id, status: failed ? "failed" : "done", trace, output: output as unknown as Record<string, unknown>, error: failed?.error ?? null });
    revalidatePath("/studio", "layout");
    return failed ? { error: `${failed.label} failed: ${failed.error}` } : {};
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.insert(flowRuns).values({ flowId: id, status: "failed", error });
    revalidatePath("/studio", "layout");
    return { error };
  }
}

/** Draft a graph from plain words. Returns it for the editor to show; nothing is saved until the person saves. */
export async function draftFlow(request: string) {
  const ws = await getWorkspace();
  if (!ws) return { error: "Not allowed" };
  if (!request.trim()) return { error: "Describe what you want first" };
  const types = await db.select({ t: observations.type }).from(observations).where(eq(observations.projectId, ws.project.id)).groupBy(observations.type);
  try {
    const pid = ws.project.id;
    const [tls, lns, srcs, mine] = await Promise.all([
      db.select().from(timelines).where(eq(timelines.projectId, pid)),
      db.select().from(sourceLanes).where(eq(sourceLanes.projectId, pid)),
      db.select().from(sources).where(eq(sources.projectId, pid)),
      db.select().from(projectProducts).where(eq(projectProducts.projectId, pid)),
    ]);
    const names = [...tls.flatMap((t) => [t.name, ...lns.filter((l) => l.timelineId === t.id).map((l) => `${t.name} / ${l.name}`)]), ...srcs.map((s) => s.name)];
    const prods = mine.flatMap((r) => { const p = getProduct(r.productId); return p && p.observationTypes.length ? [`${p.id} (${p.name})`] : []; });
    return await generateGraph(request.slice(0, 600), types.map((x) => x.t), names, prods);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "The model could not draft a flow" };
  }
}

