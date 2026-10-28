import { describe, expect, test } from "bun:test";
import { CATEGORIES, STATUS_ORDER, dependentsOf, getProduct, products, productsByCategory, productsByStatus } from "@/products";
import { productManifestSchema } from "@/products/schema";
import { NODE_DEFS, NODE_TYPES, defaultParams, order, starterGraph, validateGraph, type FlowGraph } from "@/lib/flow/types";
import { PALETTE, T0, sampleTimes, text, val, wave } from "@/widgets/kit";
import { flatten, resolveUse, widgetFor } from "@/widgets/resolve";
import { getWidget, widgets } from "@/widgets/registry";
import { widgetManifestSchema } from "@/widgets/schema";

describe("product catalog", () => {
  test("loads sorted, unique, with known dependencies", () => {
    const nos = products.map((p) => p.no);
    expect(nos).toEqual([...nos].sort((a, b) => a - b));
    expect(new Set(products.map((p) => p.id)).size).toBe(products.length);
    for (const p of products) for (const dep of p.inputs) expect(getProduct(dep)).toBeDefined();
  });
  test("every manifest passes its schema as it is", () => {
    for (const p of products) expect(productManifestSchema.parse(p)).toEqual(p);
  });
  test("lookups", () => {
    expect(getProduct("people-count")?.status).toBe("supported");
    expect(getProduct("nope")).toBeUndefined();
    expect(STATUS_ORDER.flatMap((s) => productsByStatus(s))).toHaveLength(products.length);
    expect(CATEGORIES.flatMap((c) => productsByCategory(c))).toHaveLength(products.length);
    const withInputs = products.find((p) => p.inputs.length)!;
    expect(dependentsOf(withInputs.inputs[0])).toContain(withInputs);
  });
  test("every supported product shows a widget that exists", () => {
    for (const p of productsByStatus("supported")) expect(getWidget(widgetFor(p).id)).toBeDefined();
  });
});

describe("widgets", () => {
  test("registry ids are unique and every sample renders rows for its default binding", () => {
    expect(new Set(widgets.map((w) => w.manifest.id)).size).toBe(widgets.length);
    for (const w of widgets) {
      const { bind } = resolveUse(w.manifest, { id: w.manifest.id });
      const rows = w.sample(bind);
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) expect(typeof r.t).toBe("number");
    }
  });
  test("every registry manifest passes its schema as it is", () => {
    for (const w of widgets) expect(widgetManifestSchema.parse(w.manifest)).toEqual(w.manifest);
  });
  test("widgetFor falls back by kind, then to the table", () => {
    expect(widgetFor({ kind: "timeseries" }).id).toBe("stat-trend");
    expect(widgetFor({ kind: "mystery" }).id).toBe("rows-table");
    expect(widgetFor({ kind: "dataset", widget: { id: "heat-grid" } }).id).toBe("heat-grid");
  });
  test("resolveUse fills unspecified slots and settings from the manifest", () => {
    const m = getWidget("stat-trend")!.manifest;
    expect(resolveUse(m, { id: "stat-trend" })).toEqual({ bind: { value: ["count"] }, settings: { unit: "readings", caption: "Latest reading" } });
    expect(resolveUse(m, { id: "stat-trend", bind: { value: ["n"] }, settings: { unit: "cars" } }).settings.unit).toBe("cars");
  });
  test("flatten merges datasets in time order", () => {
    const rows = flatten([
      { rows: [{ t: 2, type: "a", payload: { n: 1 } }] },
      { rows: [{ t: 1, type: "b", payload: { n: 2 } }] },
    ] as never);
    expect(rows).toEqual([{ n: 2, t: 1, type: "b" }, { n: 1, t: 2, type: "a" }]);
  });
  test("kit helpers", () => {
    const r = { t: 0, type: "x", a: "", b: "7", title: "Hello", c: 3 };
    expect(val(r, ["a", "b"])).toBe(7);
    expect(val({ t: 0, type: "x" }, ["a"], -1)).toBe(-1);
    expect(text(r, ["c"])).toBe("Hello");
    expect(text({ t: 0, type: "x" }, [], "none")).toBe("none");
    expect(wave(5, 10, 3)).toEqual(wave(5, 10, 3));
    expect(wave(20, 0, 5).every((v) => v >= 0)).toBe(true);
    expect(sampleTimes(3, 5)).toEqual([T0, T0 + 5, T0 + 10]);
    expect(PALETTE.length).toBe(5);
  });
});

describe("flow graph", () => {
  const node = (id: string, type: (typeof NODE_TYPES)[number]) => ({ id, type, x: 0, y: 0, params: defaultParams(type) });

  test("every node type has a definition and defaults", () => {
    for (const t of NODE_TYPES) {
      expect(NODE_DEFS[t]).toBeDefined();
      expect(Object.keys(defaultParams(t))).toEqual(NODE_DEFS[t].params.map((p) => p.key));
    }
  });
  test("starter graph is valid and ordered", () => {
    const g = starterGraph();
    expect(validateGraph(g)).toBeNull();
    expect(order(g)).toEqual(["n1", "n2", "n3", "n4"]);
  });
  test("rejects duplicate ids, dangling edges, bad ports, output feeding and cycles", () => {
    const dup: FlowGraph = { nodes: [node("a", "source"), node("a", "filter")], edges: [] };
    expect(validateGraph(dup)).toContain("share the id");

    const dangling: FlowGraph = { nodes: [node("a", "source")], edges: [{ id: "e", from: "a", to: "zz", port: "in" }] };
    expect(validateGraph(dangling)).toContain("does not exist");

    const badPort: FlowGraph = { nodes: [node("a", "source"), node("b", "filter")], edges: [{ id: "e", from: "a", to: "b", port: "nope" }] };
    expect(validateGraph(badPort)).toContain("no input called nope");

    const fromOutput: FlowGraph = { nodes: [node("a", "chart"), node("b", "filter")], edges: [{ id: "e", from: "a", to: "b", port: "in" }] };
    expect(validateGraph(fromOutput)).toBe("An output node cannot feed another node");

    const loop: FlowGraph = {
      nodes: [node("a", "filter"), node("b", "filter")],
      edges: [{ id: "e1", from: "a", to: "b", port: "in" }, { id: "e2", from: "b", to: "a", port: "in" }],
    };
    expect(validateGraph(loop)).toBe("The flow loops back on itself");
    expect(order(loop)).toBeNull();
  });
});
