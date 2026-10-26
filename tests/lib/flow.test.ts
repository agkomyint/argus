import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "@/db";
import { observations, sourceLanes, sources, timelines, uploads } from "@/db/schema";
import { runGraph, type Row } from "@/lib/flow/engine";
import { generateGraph } from "@/lib/flow/generate";
import { defaultParams, type FlowGraph, type FlowNode, type NodeType } from "@/lib/flow/types";
import { recordObservation } from "@/lib/observations";
import { reset, seedProject } from "../db";
import { modelCalls, scriptModel } from "../fakes";

beforeEach(reset);

const FLOW = "11111111-1111-4111-8111-111111111111";
type Params = FlowNode["params"];
const n = (id: string, type: NodeType, params: Params = {}): FlowNode => ({ id, type, x: 0, y: 0, params: { ...defaultParams(type), ...params } });
const e = (from: string, to: string, port = "in") => ({ id: `${from}-${to}-${port}`, from, to, port });

/** Feed fixed rows through one node: a source reads them back, the node under test runs, a chart collects the output. */
async function through(projectId: string, type: NodeType, params: Params, extra: { ports?: Record<string, FlowNode>; edges?: ReturnType<typeof e>[] } = {}) {
  const g: FlowGraph = {
    nodes: [n("src", "source", { limit: 500 }), n("x", type, params), n("out", "chart"), ...Object.values(extra.ports ?? {})],
    edges: [e("src", "x", extra.ports ? "a" : "in"), e("x", "out"), ...(extra.edges ?? [])],
  };
  const r = await runGraph(g, { projectId, flowId: FLOW });
  const t = r.trace.find((s) => s.id === "x")!;
  if (t.error) throw new Error(t.error);
  return { rows: r.output.charts[0]?.data ?? [], note: t.note, run: r };
}

async function seedRows(projectId: string, rows: Row[], type = "record") {
  for (const [i, payload] of rows.entries()) {
    await recordObservation({ projectId, type, eventTime: new Date(Date.UTC(2026, 0, 1, 0, i)), payload, confidence: (payload.c as number | undefined) ?? null });
  }
}

describe("runGraph basics", () => {
  test("invalid graphs throw before anything runs", async () => {
    expect(runGraph({ nodes: [n("a", "source"), n("a", "filter")], edges: [] }, { projectId: FLOW, flowId: FLOW })).rejects.toThrow("share the id");
  });

  test("a failing node skips its downstream but not its siblings", async () => {
    const { project } = await seedProject();
    const g: FlowGraph = {
      nodes: [n("bad", "source", { timeline: "Nowhere" }), n("f", "filter"), n("c", "chart"), n("ok", "source"), n("c2", "chart")],
      edges: [e("bad", "f"), e("f", "c"), e("ok", "c2")],
    };
    const { trace, output } = await runGraph(g, { projectId: project.id, flowId: FLOW });
    expect(trace.find((t) => t.id === "bad")?.error).toBe('No source named "Nowhere"');
    expect(trace.find((t) => t.id === "f")?.note).toBe("skipped: an earlier node failed");
    expect(output.charts).toHaveLength(1);
    expect(output.tables.map((t) => t.nodeId)).toEqual(["c2"]);
  });

  test("a model error is recorded as text", async () => {
    const { project } = await seedProject();
    await seedRows(project.id, [{ a: 1 }]);
    const g: FlowGraph = { nodes: [n("s", "source"), n("x", "agent")], edges: [e("s", "x")] };
    const { trace } = await runGraph(g, { projectId: project.id, flowId: FLOW });
    expect(trace[1].error).toBe("Model called with no scripted reply");
  });
});

describe("source node", () => {
  test("reads by type, by timeline, by lane and by source name", async () => {
    const { user, project } = await seedProject();
    const [tl] = await db.insert(timelines).values({ projectId: project.id, name: "Drone" }).returning();
    const [lane] = await db.insert(sourceLanes).values({ projectId: project.id, timelineId: tl.id, name: "North" }).returning();
    const [up] = await db.insert(uploads).values({ projectId: project.id, userId: user.id, key: "k", filename: "a.jpg", contentType: "image/jpeg", size: 1, status: "ready", timelineId: tl.id, laneId: lane.id }).returning();
    const [src] = await db.insert(sources).values({ projectId: project.id, kind: "weather", name: "Weather", ingestKey: "k" }).returning();
    await recordObservation({ projectId: project.id, uploadId: up.id, type: "defect_detected", eventTime: new Date(), payload: { label: "crack" } });
    await recordObservation({ projectId: project.id, sourceId: src.id, type: "weather", eventTime: new Date(), payload: { rain_mm: 2 } });

    const read = async (params: Params) => {
      const r = await runGraph({ nodes: [n("s", "source", params)], edges: [] }, { projectId: project.id, flowId: FLOW });
      return r.output.tables[0].rows;
    };
    expect(await read({})).toHaveLength(2);
    expect(await read({ obsType: "weather" })).toEqual([expect.objectContaining({ type: "weather", rain_mm: 2 })]);
    expect((await read({ timeline: "Drone" })).map((r) => r.label)).toEqual(["crack"]);
    expect((await read({ timeline: "Drone / North" })).map((r) => r.label)).toEqual(["crack"]);
    expect((await read({ timeline: "Weather" })).map((r) => r.type)).toEqual(["weather"]);
  });
});

describe("shaping nodes", () => {
  test("filter compares numbers and text", async () => {
    const { project } = await seedProject();
    await seedRows(project.id, [{ v: 1, s: "Crack" }, { v: 5, s: "rust" }, { v: "x", s: "crack wide" }]);
    const count = async (field: string, op: string, value: string) => (await through(project.id, "filter", { field, op, value })).rows.length;
    expect(await count("v", "=", "5")).toBe(1);
    expect(await count("v", "!=", "5")).toBe(2);
    expect(await count("v", ">", "1")).toBe(1);
    expect(await count("v", ">=", "1")).toBe(2);
    expect(await count("v", "<", "5")).toBe(1);
    expect(await count("v", "<=", "5")).toBe(2);
    expect(await count("v", "contains", "5")).toBe(0);
    expect(await count("s", "=", "crack")).toBe(1);
    expect(await count("s", "!=", "crack")).toBe(2);
    expect(await count("s", "contains", "crack")).toBe(2);
    expect(await count("s", ">", "a")).toBe(0);
  });

  test("sort by number or text, either way, keeping the top", async () => {
    const { project } = await seedProject();
    await seedRows(project.id, [{ v: 2, s: "b" }, { v: 10, s: "a" }, { v: 1, s: "c" }]);
    expect((await through(project.id, "sort", { field: "v", direction: "desc", limit: 2 })).rows.map((r) => r.v)).toEqual([10, 2]);
    const asc = await through(project.id, "sort", { field: "s", direction: "asc", limit: 0 });
    expect(asc.rows.map((r) => r.s)).toEqual(["a"]);
    expect(asc.note).toBe("top 1 by s ascending");
    expect((await through(project.id, "sort", { field: "s", direction: "desc", limit: 5 })).rows.map((r) => r.s)).toEqual(["c", "b", "a"]);
  });

  test("group counts and aggregates, skipping non-numbers", async () => {
    const { project } = await seedProject();
    await seedRows(project.id, [{ k: "a", v: 1 }, { k: "a", v: 3 }, { k: "b", v: 2 }, { k: "b", v: "x" }, { v: 4 }]);
    const g = async (metric: string) => Object.fromEntries((await through(project.id, "group", { groupBy: "k", metric, field: "v" })).rows.map((r) => [r.key, r.value]));
    expect(await g("count")).toEqual({ a: 2, b: 2, "(none)": 1 });
    expect(await g("sum")).toEqual({ a: 4, b: 2, "(none)": 4 });
    expect(await g("avg")).toEqual({ a: 2, b: 2, "(none)": 4 });
    expect(await g("min")).toEqual({ a: 1, b: 2, "(none)": 4 });
    expect(await g("max")).toEqual({ a: 3, b: 2, "(none)": 4 });
  });

  test("track follows an entity over time", async () => {
    const { project } = await seedProject();
    await seedRows(project.id, [{ who: "a", c: 0.5 }, { who: "a", c: 0.7 }, { who: "b" }]);
    const rows = (await through(project.id, "track", { entity: "who", timeField: "" })).rows;
    const a = rows.find((r) => r.entity === "a")!;
    expect(a).toMatchObject({ count: 2, span_minutes: 1, avg_confidence: 0.6, first_seen: "2026-01-01T00:00:00.000Z" });
    expect(rows.find((r) => r.entity === "b")).toMatchObject({ avg_confidence: null });
    const none = (await through(project.id, "track", { entity: "who", timeField: "missing" })).rows;
    expect(none[0]).toMatchObject({ first_seen: null, last_seen: null, span_minutes: 0, time: null });
  });

  test("normalize every way", async () => {
    const { project } = await seedProject();
    await seedRows(project.id, [{ f: "  Big   Crack " }, { f: "3.14159" }, { f: "2026-01-01" }, { f: null }]);
    const norm = async (normOp: string, digits = 2) => (await through(project.id, "normalize", { field: "f", normOp, digits })).rows.map((r) => r.f);
    // Sources read newest first, so rows come back in reverse insert order.
    expect(await norm("lowercase")).toEqual(["", "2026-01-01", "3.14159", "  big   crack "]);
    expect(await norm("trim")).toEqual(["", "2026-01-01", "3.14159", "Big Crack"]);
    expect(await norm("number")).toEqual([null, null, 3.14159, null]);
    expect(await norm("round", 1)).toEqual([null, null, 3.1, null]);
    expect(await norm("scale 0-1")).toEqual([null, null, 0, null]);
    expect(await norm("iso time")).toEqual([null, "2026-01-01T00:00:00.000Z", null, null]);
    expect(await norm("unknown")).toEqual([null, "2026-01-01", "3.14159", "  Big   Crack "]);
  });

  test("scale spreads a range over 0..1", async () => {
    const { project } = await seedProject();
    await seedRows(project.id, [{ f: 10 }, { f: 20 }, { f: 15 }]);
    expect((await through(project.id, "normalize", { field: "f", normOp: "scale 0-1" })).rows.map((r) => r.f)).toEqual([0.5, 1, 0]);
  });

  test("validate drops or flags by each rule", async () => {
    const { project } = await seedProject();
    await seedRows(project.id, [{ f: 1 }, { f: 5 }, { f: "" }, { f: "Car" }]);
    const kept = async (rule: string, value: string) => (await through(project.id, "validate", { field: "f", rule, value, mode: "drop" })).rows.map((r) => r.f);
    expect(await kept("not empty", "")).toEqual(["Car", 5, 1]);
    expect(await kept("at least", "2")).toEqual([5]);
    expect(await kept("at most", "2")).toEqual([1]);
    expect(await kept("one of", "car, 1")).toEqual(["Car", 1]);
    const flagged = await through(project.id, "validate", { field: "f", rule: "at least", value: "2", mode: "keep and flag" });
    expect(flagged.rows.map((r) => [r.valid, r.invalid_reason])).toEqual([[false, "f is below 2"], [false, "f is below 2"], [true, ""], [false, "f is below 2"]]);
    expect((await through(project.id, "validate", { field: "f", rule: "at most", value: "2", mode: "keep and flag" })).rows[2].invalid_reason).toBe("f is above 2");
    expect((await through(project.id, "validate", { field: "f", rule: "one of", value: "x", mode: "keep and flag" })).rows[0].invalid_reason).toBe("f is not one of x");
    expect((await through(project.id, "validate", { field: "f", rule: "not empty", value: "", mode: "keep and flag" })).rows[1].invalid_reason).toBe("f is empty");
  });

  test("layer keeps named fields plus time and confidence", async () => {
    const { project } = await seedProject();
    await seedRows(project.id, [{ a: 1, b: 2 }]);
    const [row] = (await through(project.id, "layer", { layerName: "", keepFields: "a" })).rows;
    expect(Object.keys(row).sort()).toEqual(["a", "confidence", "layer", "time"]);
    expect(row.layer).toBe("unified");
    expect((await through(project.id, "layer", { layerName: "all", keepFields: "" })).rows[0]).toMatchObject({ layer: "all", a: 1, b: 2 });
  });

  test("chart kinds fall back to bar", async () => {
    const { project } = await seedProject();
    await seedRows(project.id, [{ a: 1 }]);
    const kind = async (k: string) => (await runGraph({ nodes: [n("s", "source"), n("c", "chart", { kind: k })], edges: [e("s", "c")] }, { projectId: project.id, flowId: FLOW })).output.charts[0].kind;
    expect(await kind("pie")).toBe("bar");
    expect(await kind("line")).toBe("line");
  });
});

describe("fuse node", () => {
  test("joins the nearest partner within the window, optionally on a key", async () => {
    const { project } = await seedProject();
    await seedRows(project.id, [{ side: "a", asset: "P1" }, { side: "a", asset: "P2" }, { side: "a", asset: "P3" }], "left");
    for (const [min, asset] of [[0, "P1"], [2, "P2"], [1, "P1"]] as const) {
      await recordObservation({ projectId: project.id, type: "right", eventTime: new Date(Date.UTC(2026, 0, 1, 0, min, 30)), payload: { asset, v: min } });
    }
    const fuse = async (params: Params) => {
      const g: FlowGraph = {
        nodes: [n("l", "source", { obsType: "left" }), n("r", "source", { obsType: "right" }), n("f", "fuse", params), n("out", "chart")],
        edges: [e("l", "f", "a"), e("r", "f", "b"), e("f", "out")],
      };
      return (await runGraph(g, { projectId: project.id, flowId: FLOW })).output.charts[0].data;
    };
    const keyed = await fuse({ joinKey: "asset", windowMin: 5, unmatched: "drop" });
    expect(keyed.map((r) => [r.asset, r.b_v, r.gap_minutes])).toEqual([["P2", 2, 1.5], ["P1", 0, 0.5]]);
    expect(keyed.every((r) => !("b_id" in r))).toBe(true);
    const keep = await fuse({ joinKey: "asset", windowMin: 5, unmatched: "keep" });
    expect(keep).toHaveLength(3);
    const byTime = await fuse({ joinKey: "", windowMin: 0, unmatched: "drop" });
    expect(byTime).toHaveLength(0);
  });
});

describe("model nodes", () => {
  test("extract fills named fields, blank when the model says nothing", async () => {
    const { project } = await seedProject();
    await seedRows(project.id, [{ t: "red car" }, { t: "blue van" }]);
    scriptModel({ records: [{ index: 0, values: [{ field: "color", value: "red" }] }] });
    const r = await through(project.id, "extract", { fields: "color, object", limit: 0 });
    expect(r.rows).toEqual([expect.objectContaining({ color: "red", object: "" })]);
    expect((await through(project.id, "extract", { fields: " " })).note).toBe("no rows or no fields");
  });

  test("classify keeps known labels, clamps confidence and falls back to other", async () => {
    const { project } = await seedProject();
    await seedRows(project.id, [{ t: 1 }, { t: 2 }, { t: 3 }]);
    scriptModel({ results: [{ index: 0, label: "minor", confidence: 1.4 }, { index: 1, label: "weird", confidence: -1 }] });
    const r = await through(project.id, "classify", { labels: "minor, serious" });
    expect(r.rows.map((x) => [x.class, x.class_confidence])).toEqual([["minor", 1], ["other", 0], ["other", 0]]);
    expect(r.note).toBe("classified 3 rows into 2 labels");
    expect((await through(project.id, "classify", { labels: "" })).note).toBe("no rows or no labels");
  });

  test("agent turns rows into claims, and has nothing to say about no rows", async () => {
    const { project } = await seedProject();
    expect((await through(project.id, "agent", {})).note).toBe("no rows to read");
    await seedRows(project.id, [{ v: 42 }]);
    scriptModel({ claims: [{ text: "v is 42", numbers: [42] }] });
    expect((await through(project.id, "agent", { limit: 0 })).rows).toEqual([{ text: "v is 42", numbers: [42] }]);
    expect(modelCalls).toHaveLength(1);
  });

  test("factcheck verifies claim numbers against the evidence rows", async () => {
    const { project } = await seedProject();
    await seedRows(project.id, [{ v: 42 }]);
    const claims = { claims: [{ text: "v is 42", numbers: [42] }, { text: "v is 7", numbers: [7] }, { text: "has 3 digits", numbers: [] }, { text: "no digits", numbers: [] }] };
    const check = async (keep: string, withRef = true) => {
      scriptModel(claims);
      const g: FlowGraph = {
        nodes: [n("s", "source"), n("a", "agent"), n("fc", "factcheck", { keep }), n("out", "chart")],
        edges: [e("s", "a"), e("a", "fc"), ...(withRef ? [e("s", "fc", "ref")] : []), e("fc", "out")],
      };
      return (await runGraph(g, { projectId: project.id, flowId: FLOW })).output.charts[0].data;
    };
    expect((await check("verified only")).map((r) => r.text)).toEqual(["v is 42", "no digits"]);
    const all = await check("everything");
    expect(all.map((r) => r.reason)).toEqual(["every number found in the evidence", "number 7 is not in the evidence", "quotes digits without listing them", "every number found in the evidence"]);
    expect((await check("everything", false)).every((r) => r.reason === "no evidence rows connected" && !r.verified)).toBe(true);
  });

  test("factcheck tolerates claims with no numbers list", async () => {
    const { project } = await seedProject();
    await seedRows(project.id, [{ text: "plain", numbers: "n/a", evidence: 1 }]);
    const g: FlowGraph = { nodes: [n("s", "source"), n("fc", "factcheck", { keep: "everything" }), n("out", "chart")], edges: [e("s", "fc"), e("s", "fc", "ref")] .concat([e("fc", "out")]) };
    const [row] = (await runGraph(g, { projectId: project.id, flowId: FLOW })).output.charts[0].data;
    expect(row.verified).toBe(true);
  });

  test("a made-up zero is not verified", async () => {
    const { project } = await seedProject();
    await seedRows(project.id, [{ text: "count is 0", numbers: [0], evidence: 5 }]);
    const g: FlowGraph = { nodes: [n("s", "source"), n("fc", "factcheck", { keep: "everything" }), n("out", "chart")], edges: [e("s", "fc"), e("s", "fc", "ref"), e("fc", "out")] };
    const [row] = (await runGraph(g, { projectId: project.id, flowId: FLOW })).output.charts[0].data;
    expect(row).toMatchObject({ verified: false, reason: "number 0 is not in the evidence" });
  });
});

describe("publish node", () => {
  test("writes into a product's dataset and replaces its own earlier output", async () => {
    const { project } = await seedProject();
    await seedRows(project.id, [{ count: 3, c: 0.9 }], "src_rows");
    await recordObservation({ projectId: project.id, type: "people_count", eventTime: new Date(), payload: { mine: false } });
    const g: FlowGraph = { nodes: [n("s", "source", { obsType: "src_rows" }), n("p", "publish", { product: "people-count" })], edges: [e("s", "p")] };
    for (let i = 0; i < 2; i++) {
      const { output } = await runGraph(g, { projectId: project.id, flowId: FLOW });
      expect(output.published).toEqual([{ type: "people_count", count: 1 }]);
    }
    const pc = (await db.select().from(observations)).filter((o) => o.type === "people_count");
    expect(pc).toHaveLength(2);
    const mine = pc.find((o) => o.provenance.flowId === FLOW)!;
    expect(mine.confidence).toBe(0.9);
    expect(mine.eventTime.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  test("custom names are cleaned; rows without time get now; empty input publishes nothing", async () => {
    const { project } = await seedProject();
    const g = (publishType: string): FlowGraph => ({ nodes: [n("s", "source", { obsType: "nothing" }), n("p", "publish", { publishType })], edges: [e("s", "p")] });
    expect((await runGraph(g("My Flow!"), { projectId: project.id, flowId: FLOW })).output.published).toEqual([{ type: "my_flow_", count: 0 }]);
    expect((await runGraph(g(""), { projectId: project.id, flowId: FLOW })).output.published[0].type).toBe("flow_output");

    await seedRows(project.id, [{ a: 1 }], "with_time");
    const noTime: FlowGraph = { nodes: [n("s", "source", { obsType: "with_time" }), n("l", "layer", { keepFields: "a" }), n("t", "track", { entity: "a", timeField: "nope" }), n("p", "publish", { publishType: "tracks" })], edges: [e("s", "l"), e("l", "t"), e("t", "p")] };
    const before = Date.now();
    await runGraph(noTime, { projectId: project.id, flowId: FLOW });
    const [row] = (await db.select().from(observations)).filter((o) => o.type === "tracks");
    expect(row.eventTime.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });
});

describe("generateGraph", () => {
  const blank = { obsType: "", limit: 0, field: "", op: "", value: "", timeline: "", fields: "", labels: "", entity: "", timeField: "", normOp: "", digits: 0, rule: "", mode: "", joinKey: "", windowMin: 0, unmatched: "", layerName: "", keepFields: "", product: "", direction: "", groupBy: "" };

  test("lays out a valid draft in columns, drops duplicates and dangling edges", async () => {
    scriptModel((req: unknown) => {
      expect(JSON.stringify(req)).toContain("Pier cam");
      return {
        nodes: [
          { id: "n1", type: "source", params: { ...blank, obsType: "defect_detected", limit: 50 } },
          { id: "n1", type: "chart", params: blank },
          { id: "n2", type: "filter", params: { ...blank, field: "confidence", op: ">=", value: "0.8" } },
          { id: "n3", type: "chart", params: blank },
        ],
        edges: [{ from: "n1", to: "n2", port: "" }, { from: "n2", to: "n3", port: "in" }, { from: "n2", to: "zz", port: "in" }],
      };
    });
    const { graph, error } = await generateGraph("strong cracks", ["defect_detected"], ["Pier cam"], ["people-count"]);
    expect(error).toBeUndefined();
    expect(graph!.nodes.map((x) => [x.id, x.type, x.x, x.y])).toEqual([["n1", "source", 0, 0], ["n2", "filter", 270, 0], ["n3", "chart", 540, 0]]);
    expect(graph!.nodes[0].params).toMatchObject({ obsType: "defect_detected", limit: 50 });
    expect(graph!.nodes[1].params).toMatchObject({ value: "0.8" });
    expect(graph!.edges).toEqual([{ id: "e1", from: "n1", to: "n2", port: "in" }, { id: "e2", from: "n2", to: "n3", port: "in" }]);
  });

  test("an unusable draft becomes a plain-words error", async () => {
    scriptModel({ nodes: [{ id: "n1", type: "filter", params: blank }, { id: "n2", type: "filter", params: blank }], edges: [{ from: "n1", to: "n2", port: "in" }, { from: "n2", to: "n1", port: "in" }] });
    const r = await generateGraph("loop", []);
    expect(r.error).toBe("The draft was not usable: The flow loops back on itself. Try describing it again.");
    expect(JSON.stringify(modelCalls[0])).toContain("none yet");
  });
});
