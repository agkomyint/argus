import { z } from "zod";

/**
 * A flow is plain JSON: nodes with flat params, and edges between them. The editor, the engine
 * and AI agents all read and write exactly this shape (see docs/FLOWS.md). Client-safe: no DB.
 */
export const NODE_TYPES = ["source", "filter", "sort", "group", "extract", "classify", "track", "normalize", "validate", "agent", "factcheck", "fuse", "layer", "chart", "publish"] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export type ParamSpec = {
  key: string;
  label: string;
  kind: "text" | "number" | "select" | "textarea";
  options?: string[];
  default: string | number;
  hint?: string;
  /** Options come from the project (its sources, or the supported data products). */
  optionsFrom?: "sources" | "products";
};

export type NodeDef = {
  type: NodeType;
  label: string;
  /** Plain-words job, shown in the palette. */
  blurb: string;
  group: "Data sources" | "Shape" | "Agents" | "Fusion" | "Output";
  inputs: { port: string; label: string }[];
  hasOutput: boolean;
  params: ParamSpec[];
};

const OPS = ["=", "!=", ">", ">=", "<", "<=", "contains"];

export const NODE_DEFS: Record<NodeType, NodeDef> = {
  source: {
    type: "source", label: "Data source", group: "Data sources", inputs: [], hasOutput: true,
    blurb: "Read the data one of your sources has delivered: a files timeline or lane, a sensor, a weather feed.",
    params: [
      { key: "timeline", label: "Source", kind: "select", default: "", optionsFrom: "sources", hint: "Empty reads the whole project" },
      { key: "obsType", label: "Observation type", kind: "text", default: "", hint: "Empty reads every type. e.g. defect_detected, sensor_reading, weather, people_count" },
      { key: "limit", label: "Newest rows", kind: "number", default: 100 },
    ],
  },
  filter: {
    type: "filter", label: "Filter", group: "Shape", inputs: [{ port: "in", label: "rows" }], hasOutput: true,
    blurb: "Keep only rows where a field matches.",
    params: [
      { key: "field", label: "Field", kind: "text", default: "confidence" },
      { key: "op", label: "Is", kind: "select", options: OPS, default: ">=" },
      { key: "value", label: "Value", kind: "text", default: "0.5" },
    ],
  },
  sort: {
    type: "sort", label: "Sort", group: "Shape", inputs: [{ port: "in", label: "rows" }], hasOutput: true,
    blurb: "Order rows by a field and keep the top few.",
    params: [
      { key: "field", label: "Field", kind: "text", default: "confidence" },
      { key: "direction", label: "Order", kind: "select", options: ["desc", "asc"], default: "desc" },
      { key: "limit", label: "Keep top", kind: "number", default: 20 },
    ],
  },
  group: {
    type: "group", label: "Group", group: "Shape", inputs: [{ port: "in", label: "rows" }], hasOutput: true,
    blurb: "Group rows and count or average them.",
    params: [
      { key: "groupBy", label: "Group by", kind: "text", default: "label" },
      { key: "metric", label: "Measure", kind: "select", options: ["count", "avg", "sum", "min", "max"], default: "count" },
      { key: "field", label: "Of field", kind: "text", default: "confidence", hint: "Ignored for count" },
    ],
  },
  agent: {
    type: "agent", label: "AI analyst", group: "Agents", inputs: [{ port: "in", label: "rows" }], hasOutput: true,
    blurb: "Ask the Meta model a question about the rows. It returns claims that cite numbers.",
    params: [
      { key: "prompt", label: "Instruction", kind: "textarea", default: "State the three most important facts in these rows. Quote exact numbers." },
      { key: "limit", label: "Rows to read", kind: "number", default: 30 },
    ],
  },
  factcheck: {
    type: "factcheck", label: "Fact check", group: "Agents", inputs: [{ port: "in", label: "claims" }, { port: "ref", label: "evidence rows" }], hasOutput: true,
    blurb: "Checks every number in each claim against the evidence rows. Code, not a model.",
    params: [{ key: "keep", label: "Pass on", kind: "select", options: ["verified only", "everything"], default: "verified only" }],
  },
  extract: {
    type: "extract", label: "Extraction", group: "Agents", inputs: [{ port: "in", label: "rows" }], hasOutput: true,
    blurb: "An AI agent reads each row and pulls out the fields you name (a plate, a colour, a count).",
    params: [
      { key: "fields", label: "Fields to extract", kind: "text", default: "object, color", hint: "Comma separated" },
      { key: "prompt", label: "Hint", kind: "textarea", default: "Fill a field only when the row clearly says it." },
      { key: "limit", label: "Rows to read", kind: "number", default: 30 },
    ],
  },
  classify: {
    type: "classify", label: "Classification", group: "Agents", inputs: [{ port: "in", label: "rows" }], hasOutput: true,
    blurb: "An AI agent puts each row into one of your labels and says how sure it is.",
    params: [
      { key: "labels", label: "Labels", kind: "text", default: "minor, serious, other", hint: "Comma separated. Rows that fit none get 'other'" },
      { key: "prompt", label: "Hint", kind: "textarea", default: "Pick the single best label." },
      { key: "limit", label: "Rows to read", kind: "number", default: 30 },
    ],
  },
  track: {
    type: "track", label: "Tracking", group: "Agents", inputs: [{ port: "in", label: "rows" }], hasOutput: true,
    blurb: "Follow the same thing over time: first seen, last seen, how often, how long. Code, not a model.",
    params: [
      { key: "entity", label: "Follow by field", kind: "text", default: "label", hint: "e.g. asset, label, person_id" },
      { key: "timeField", label: "Time field", kind: "text", default: "time" },
    ],
  },
  normalize: {
    type: "normalize", label: "Normalizing", group: "Agents", inputs: [{ port: "in", label: "rows" }], hasOutput: true,
    blurb: "Make one field consistent: same case, real numbers, rounded, scaled 0 to 1, or an ISO time.",
    params: [
      { key: "field", label: "Field", kind: "text", default: "label" },
      { key: "normOp", label: "Make it", kind: "select", options: ["lowercase", "trim", "number", "round", "scale 0-1", "iso time"], default: "lowercase" },
      { key: "digits", label: "Decimals (round)", kind: "number", default: 2 },
    ],
  },
  validate: {
    type: "validate", label: "Validating", group: "Agents", inputs: [{ port: "in", label: "rows" }], hasOutput: true,
    blurb: "Check each row against a rule. Drop the ones that fail, or keep them marked with the reason.",
    params: [
      { key: "field", label: "Field", kind: "text", default: "confidence" },
      { key: "rule", label: "Rule", kind: "select", options: ["not empty", "at least", "at most", "one of"], default: "at least" },
      { key: "value", label: "Value", kind: "text", default: "0.5", hint: "For 'one of', comma separated" },
      { key: "mode", label: "Failing rows", kind: "select", options: ["drop", "keep and flag"], default: "drop" },
    ],
  },
  fuse: {
    type: "fuse", label: "Fusion", group: "Fusion", inputs: [{ port: "a", label: "main rows" }, { port: "b", label: "rows to join" }], hasOutput: true,
    blurb: "Join two data sources by time (and an optional shared field) into one row per moment.",
    params: [
      { key: "joinKey", label: "Also match on field", kind: "text", default: "", hint: "e.g. asset. Empty matches by time only" },
      { key: "windowMin", label: "Within minutes", kind: "number", default: 10 },
      { key: "unmatched", label: "Rows with no partner", kind: "select", options: ["drop", "keep"], default: "drop" },
    ],
  },
  layer: {
    type: "layer", label: "Unified layer", group: "Fusion", inputs: [{ port: "in", label: "rows (connect many)" }], hasOutput: true,
    blurb: "Stack everything connected into one named layer with consistent fields, ready to become a product.",
    params: [
      { key: "layerName", label: "Layer name", kind: "text", default: "unified" },
      { key: "keepFields", label: "Keep fields", kind: "text", default: "", hint: "Comma separated. Empty keeps all. Time and confidence always stay" },
    ],
  },
  chart: {
    type: "chart", label: "Chart", group: "Output", inputs: [{ port: "in", label: "rows" }], hasOutput: false,
    blurb: "Show the rows as a chart or a big number.",
    params: [
      { key: "kind", label: "Kind", kind: "select", options: ["bar", "line", "number"], default: "bar" },
      { key: "x", label: "X (label)", kind: "text", default: "key" },
      { key: "y", label: "Y (value)", kind: "text", default: "value" },
    ],
  },
  publish: {
    type: "publish", label: "Save to product", group: "Output", inputs: [{ port: "in", label: "rows" }], hasOutput: false,
    blurb: "Save the rows into a data product, so its widget shows them and people can download the CSV.",
    params: [
      { key: "product", label: "Data product", kind: "select", default: "", optionsFrom: "products", hint: "Empty saves under the custom name below" },
      { key: "publishType", label: "Custom data name", kind: "text", default: "flow_output", hint: "Lowercase letters, digits and underscores" },
    ],
  },
};

export const nodeSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(NODE_TYPES),
  x: z.number(),
  y: z.number(),
  params: z.record(z.string(), z.union([z.string().max(600), z.number()])),
});
export const edgeSchema = z.object({ id: z.string().min(1).max(60), from: z.string(), to: z.string(), port: z.string() });
export const graphSchema = z.object({ nodes: z.array(nodeSchema).max(30), edges: z.array(edgeSchema).max(60) });

export type FlowNode = z.infer<typeof nodeSchema>;
export type FlowEdge = z.infer<typeof edgeSchema>;
export type FlowGraph = z.infer<typeof graphSchema>;

export const defaultParams = (type: NodeType): FlowNode["params"] => Object.fromEntries(NODE_DEFS[type].params.map((p) => [p.key, p.default]));

/** Returns a plain-words problem, or null when the graph is sound enough to run. */
export function validateGraph(g: FlowGraph): string | null {
  const ids = new Set<string>();
  for (const n of g.nodes) {
    if (ids.has(n.id)) return `Two nodes share the id ${n.id}`;
    ids.add(n.id);
  }
  for (const e of g.edges) {
    const to = g.nodes.find((n) => n.id === e.to);
    if (!ids.has(e.from) || !to) return "An edge points at a node that does not exist";
    if (!NODE_DEFS[to.type].inputs.some((i) => i.port === e.port)) return `${NODE_DEFS[to.type].label} has no input called ${e.port}`;
    if (!NODE_DEFS[g.nodes.find((n) => n.id === e.from)!.type].hasOutput) return "An output node cannot feed another node";
  }
  if (order(g) === null) return "The flow loops back on itself";
  return null;
}

/** Topological order, or null when there is a cycle. */
export function order(g: FlowGraph): string[] | null {
  const indeg = new Map(g.nodes.map((n) => [n.id, 0]));
  for (const e of g.edges) indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  const queue = [...indeg].filter(([, d]) => d === 0).map(([id]) => id);
  const out: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    out.push(id);
    for (const e of g.edges) if (e.from === id) {
      const d = (indeg.get(e.to) ?? 1) - 1;
      indeg.set(e.to, d);
      if (d === 0) queue.push(e.to);
    }
  }
  return out.length === g.nodes.length ? out : null;
}

/** A starting point that works on any project with detections: strongest findings, counted by label, charted. */
export function starterGraph(): FlowGraph {
  return {
    nodes: [
      { id: "n1", type: "source", x: 0, y: 40, params: { ...defaultParams("source") } },
      { id: "n2", type: "filter", x: 260, y: 40, params: { ...defaultParams("filter") } },
      { id: "n3", type: "group", x: 520, y: 40, params: { ...defaultParams("group") } },
      { id: "n4", type: "chart", x: 780, y: 40, params: { ...defaultParams("chart") } },
    ],
    edges: [
      { id: "e1", from: "n1", to: "n2", port: "in" },
      { id: "e2", from: "n2", to: "n3", port: "in" },
      { id: "e3", from: "n3", to: "n4", port: "in" },
    ],
  };
}

/** Shape the model fills in when asked to draw a flow. Every key is required (Meta structured output). */
export const generatedGraphSchema = z.object({
  nodes: z.array(z.object({
    id: z.string(),
    type: z.enum(NODE_TYPES),
    params: z.object({
      obsType: z.string().describe("source only, else empty"),
      limit: z.number().describe("source, sort, agent; else 0"),
      field: z.string().describe("filter, sort, group; else empty"),
      op: z.string().describe("filter only: = != > >= < <= contains; else empty"),
      value: z.string().describe("filter or validate; else empty"),
      timeline: z.string().describe("source only: a source name from the list given, else empty"),
      fields: z.string().describe("extract only: comma separated field names; else empty"),
      labels: z.string().describe("classify only: comma separated labels; else empty"),
      entity: z.string().describe("track only; else empty"),
      timeField: z.string().describe("track only; else empty"),
      normOp: z.string().describe("normalize only: lowercase trim number round scale 0-1 iso time; else empty"),
      digits: z.number().describe("normalize round only; else 0"),
      rule: z.string().describe("validate only: not empty, at least, at most, one of; else empty"),
      mode: z.string().describe("validate only: drop or keep and flag; else empty"),
      joinKey: z.string().describe("fuse only; else empty"),
      windowMin: z.number().describe("fuse only; else 0"),
      unmatched: z.string().describe("fuse only: drop or keep; else empty"),
      layerName: z.string().describe("layer only; else empty"),
      keepFields: z.string().describe("layer only; else empty"),
      product: z.string().describe("publish only: a product id from the list given, else empty"),
      direction: z.string().describe("sort only: asc or desc; else empty"),
      groupBy: z.string().describe("group only; else empty"),
      metric: z.string().describe("group only: count avg sum min max; else empty"),
      prompt: z.string().describe("agent only; else empty"),
      keep: z.string().describe("factcheck only: 'verified only' or 'everything'; else empty"),
      kind: z.string().describe("chart only: bar line number; else empty"),
      x: z.string().describe("chart only; else empty"),
      y: z.string().describe("chart only; else empty"),
      publishType: z.string().describe("publish only; else empty"),
    }),
  })).max(14),
  edges: z.array(z.object({ from: z.string(), to: z.string(), port: z.string().describe("'in' for almost everything; 'ref' for the evidence input of factcheck") })).max(20),
});
