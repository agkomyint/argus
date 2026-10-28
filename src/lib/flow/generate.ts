import "server-only";
import { generateText, Output } from "ai";
import { chatModel } from "@/lib/meta";
import { NODE_DEFS, defaultParams, generatedGraphSchema, validateGraph, type FlowGraph } from "./types";

const CATALOG = Object.values(NODE_DEFS)
  .map((d) => `- ${d.type}: ${d.blurb} Inputs: ${d.inputs.map((i) => i.port).join(", ") || "none"}. Params: ${d.params.map((x) => x.key).join(", ")}.`)
  .join("\n");

/** Ask the model to draw a flow from plain words. The result is validated like a hand-built one. */
export async function generateGraph(request: string, obsTypes: string[], sourceNames: string[] = [], products: string[] = []): Promise<{ graph?: FlowGraph; error?: string }> {
  const { output } = await generateText({
    model: chatModel(),
    output: Output.object({ schema: generatedGraphSchema }),
    system:
      "You design small data flows by wiring nodes. Rows travel along edges from left to right. Start with source nodes (one per data source you use), end with chart nodes and a publish node that saves into a data product. Typical shape: source -> extract/classify/track/normalize/validate -> fuse (two sources, ports a and b) -> layer (a unified layer, many inputs allowed) -> publish. A factcheck node needs its claims on port 'in' (from an agent node) and the same evidence rows on port 'ref'. Never loop. Use at most 14 nodes. Node ids are n1, n2, ... Fill unused params with empty strings or 0.\n\nNODES:\n" +
      CATALOG +
      `\n\nData sources this project has (use these exact names in a source node's timeline param, or leave it empty for the whole project): ${sourceNames.join("; ") || "none yet"}.\nData products it can save to (publish node's product param, exact id): ${products.join("; ") || "none"}.\nObservation types this project actually has: ${obsTypes.join(", ") || "none yet"}. Row fields from a source: id, type, time, confidence plus the observation's own payload fields (for detections: label). Group outputs rows with key, value, n.`,
    prompt: request,
  });

  const kept = new Set<string>();
  const nodes = output.nodes.slice(0, 14).filter((n) => !kept.has(n.id) && kept.add(n.id));
  const edges = output.edges.filter((e) => kept.has(e.from) && kept.has(e.to));

  // Lay out in columns by distance from the sources.
  const depth = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (let i = 0; i < nodes.length; i++) for (const e of edges) depth.set(e.to, Math.max(depth.get(e.to) ?? 0, (depth.get(e.from) ?? 0) + 1));
  const rowOf = new Map<number, number>();

  const graph: FlowGraph = {
    nodes: nodes.map((n) => {
      const d = depth.get(n.id) ?? 0;
      const r = rowOf.get(d) ?? 0;
      rowOf.set(d, r + 1);
      const params = defaultParams(n.type);
      for (const spec of NODE_DEFS[n.type].params) {
        const v = (n.params as Record<string, string | number>)[spec.key];
        // A select value outside its list keeps the default, so a loose draft still validates.
        if (spec.kind === "select" && spec.options && !spec.options.includes(String(v))) continue;
        if (v !== undefined && v !== "" && !(spec.kind === "number" && v === 0)) params[spec.key] = spec.kind === "number" ? Number(v) : String(v);
      }
      return { id: n.id, type: n.type, x: d * 270, y: r * 190, params };
    }),
    edges: edges.map((e, i) => ({ id: `e${i + 1}`, from: e.from, to: e.to, port: e.port || "in" })),
  };
  const problem = validateGraph(graph);
  return problem ? { error: `The draft was not usable: ${problem}. Try describing it again.` } : { graph };
}
