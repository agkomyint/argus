import { describe, expect, test } from "bun:test";
import { AGENT_LEVELS, VOLUMES, agentLevel, money } from "@/lib/agent-levels";
import { DEFAULT_CONFIG, pickLane, resolveConfig, resolveLanes, type Lane } from "@/lib/agent-config";
import { datasetCsv, parseCsv } from "@/lib/csv";
import { formatSize } from "@/lib/format";
import { pickableProducts } from "@/lib/pickable";
import { SOURCE_LABEL, productsUsing, sourcesFor, suggestSources } from "@/lib/product-sources";
import { clock, num } from "@/lib/product-types";
import { PROJECT_KINDS, kindLabel } from "@/lib/projects";
import { severityOf } from "@/lib/severity";
import { SOLUTIONS, getSolution, solutionOf } from "@/lib/solutions";
import { parseKey, srcKey, tlKey } from "@/lib/source-key";
import { DEFAULT_FREQUENCY, FREQUENCIES, estimate, frequencyIndex } from "@/lib/tune";
import { MAX_UPLOAD_BYTES, extensionOf, isAllowedFile, safeName } from "@/lib/uploads";
import { cn } from "@/lib/utils";
import { META_CONFIGURED, chatModel } from "@/lib/meta";

const UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("agent levels", () => {
  test("clamps the index into range", () => {
    expect(agentLevel(-3).name).toBe("Lean");
    expect(agentLevel(2).name).toBe("Balanced");
    expect(agentLevel(99).name).toBe("Maximum");
    expect(AGENT_LEVELS).toHaveLength(5);
    expect(VOLUMES).toEqual([500, 2000, 10000]);
  });
  test("money shows cents under 10 and whole dollars above", () => {
    expect(money(0.4)).toBe("$0.40");
    expect(money(9.999)).toBe("$10.00");
    expect(money(12.6)).toBe("$13");
  });
});

describe("agent config", () => {
  test("missing or junk config falls back to defaults", () => {
    expect(resolveConfig(undefined)).toEqual(DEFAULT_CONFIG);
    expect(resolveConfig("nope")).toEqual(DEFAULT_CONFIG);
    expect(resolveConfig({ perception: null })).toEqual(DEFAULT_CONFIG);
  });
  test("valid pieces merge over defaults, invalid pieces are dropped", () => {
    const c = resolveConfig({ perception: { minConfidence: 0.7 }, correlation: { windowMinutes: 5 } });
    expect(c.perception.minConfidence).toBe(0.7);
    expect(c.correlation.windowMinutes).toBe(60);
  });
  test("high threshold at or below medium resets analysis", () => {
    const c = resolveConfig({ analysis: { mediumAt: 4, highAt: 4 } });
    expect(c.analysis).toEqual(DEFAULT_CONFIG.analysis);
  });
  test("lanes parse or come back empty", () => {
    const lane: Lane = { id: "a", name: "Strong", enabled: true, from: 0.8, to: 1, recipe: "quick", level: null };
    expect(resolveLanes({ lanes: [lane] })).toEqual([lane]);
    expect(resolveLanes({ lanes: [{ ...lane, from: 0.9, to: 0.1 }] })).toEqual([]);
    expect(resolveLanes(null)).toEqual([]);
    expect(resolveLanes({})).toEqual([]);
  });
  test("pickLane takes the first enabled lane holding the confidence", () => {
    const lanes: Lane[] = [
      { id: "off", name: "Off", enabled: false, from: 0, to: 1, recipe: "full", level: null },
      { id: "low", name: "Low", enabled: true, from: 0, to: 0.5, recipe: "quick", level: 0 },
      { id: "top", name: "Top", enabled: true, from: 0.5, to: 1, recipe: "full", level: 4 },
    ];
    expect(pickLane(lanes, 0.2)?.id).toBe("low");
    expect(pickLane(lanes, null)?.id).toBe("low");
    expect(pickLane(lanes, 0.5)?.id).toBe("top");
    expect(pickLane(lanes, 1)?.id).toBe("top");
    expect(pickLane([lanes[1]], 0.9)).toBeNull();
  });
});

describe("csv", () => {
  test("parses quotes, escaped quotes, CRLF, BOM and blank lines", () => {
    const rows = parseCsv('﻿Name,Note\r\n"Pier A","said ""hi"", twice"\r\n\r\nPier B,plain\nPier C,"multi\nline"');
    expect(rows).toEqual([
      { name: "Pier A", note: 'said "hi", twice' },
      { name: "Pier B", note: "plain" },
      { name: "Pier C", note: "multi\nline" },
    ]);
  });
  test("empty input and short rows", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("a,b\n1")).toEqual([{ a: "1", b: "" }]);
    expect(parseCsv("a\n1\n")).toEqual([{ a: "1" }]);
  });
  test("datasetCsv writes every payload key and escapes cells", () => {
    const out = datasetCsv([
      { t: Date.UTC(2026, 0, 1), payload: { label: "crack, wide", n: 2 } },
      { t: Date.UTC(2026, 0, 2), payload: { meta: { a: 1 }, empty: null, q: 'say "x"' } },
    ]);
    const lines = out.trimEnd().split("\n");
    expect(lines[0]).toBe("observed_at,label,n,meta,empty,q");
    expect(lines[1]).toBe('2026-01-01T00:00:00.000Z,"crack, wide",2,,,');
    expect(lines[2]).toBe('2026-01-02T00:00:00.000Z,,,"{""a"":1}",,"say ""x"""');
    expect(out.endsWith("\n")).toBe(true);
  });
});

describe("small helpers", () => {
  test("formatSize", () => {
    expect(formatSize(10)).toBe("1 KB");
    expect(formatSize(300 * 1024)).toBe("300 KB");
    expect(formatSize(5.25 * 1024 * 1024)).toBe("5.3 MB");
  });
  test("cn merges tailwind classes", () => {
    expect(cn("p-2", false && "x", "p-4")).toBe("p-4");
  });
  test("product-types num and clock", () => {
    expect(num("3")).toBe(3);
    expect(num("x")).toBe(0);
    expect(clock(Date.UTC(2026, 0, 1, 9, 5, 7))).toBe("09:05:07Z");
  });
  test("project kinds", () => {
    expect(kindLabel("bridge")).toBe("Bridge");
    expect(kindLabel("spaceport")).toBe("spaceport");
    expect(PROJECT_KINDS.length).toBeGreaterThan(0);
  });
  test("uploads", () => {
    expect(extensionOf("Pier.A.JPG")).toBe("jpg");
    expect(extensionOf("README")).toBe("");
    expect(isAllowedFile("a.csv")).toBe(true);
    expect(isAllowedFile("a.exe")).toBe(false);
    expect(safeName("my file (1).png")).toBe("my_file_1_.png");
    expect(safeName("x".repeat(200))).toHaveLength(120);
    expect(MAX_UPLOAD_BYTES).toBe(500 * 1024 * 1024);
  });
  test("meta model is built from env", () => {
    expect(typeof META_CONFIGURED).toBe("boolean");
    expect(chatModel().modelId).toBe("test-model");
  });
});

describe("source keys", () => {
  test("build and parse", () => {
    expect(srcKey(UUID)).toBe(`src:${UUID}`);
    expect(tlKey(UUID)).toBe(`tl:${UUID}`);
    expect(parseKey(`src:${UUID}`)).toEqual({ type: "src", id: UUID });
    expect(parseKey(`tl:${UUID}`)).toEqual({ type: "tl", id: UUID });
    expect(parseKey("files")).toEqual({ type: "files" });
    expect(parseKey("screen")).toEqual({ type: "screen" });
    expect(parseKey("src:nope")).toBeNull();
  });
});

describe("severity", () => {
  const none = { confidence: null, vibrationRatio: null, rainMm24h: null, worstRating: null };
  test("no signals is low with no reasons", () => {
    expect(severityOf(none)).toEqual({ level: "low", reasons: [] });
  });
  test("each rule adds its reason", () => {
    const r = severityOf({ confidence: 0.9, vibrationRatio: 2, rainMm24h: 12, worstRating: 3 });
    expect(r.level).toBe("high");
    expect(r.reasons).toHaveLength(4);
  });
  test("medium band and thresholds from config", () => {
    expect(severityOf({ ...none, confidence: 0.6, rainMm24h: 10 }).level).toBe("medium");
    expect(severityOf({ ...none, confidence: 0.6 }).level).toBe("low");
    const cfg = { ...DEFAULT_CONFIG.analysis, rainMm: 50 };
    expect(severityOf({ ...none, rainMm24h: 12 }, cfg).reasons).toEqual([]);
  });
});

describe("solutions and product sources", () => {
  test("solutions lookup", () => {
    expect(getSolution("bridge-monitoring")?.live).toBe(true);
    expect(getSolution(null)).toBeUndefined();
    expect(solutionOf({ product: "crowd-insight", kind: "other" })?.id).toBe("crowd-insight");
    expect(solutionOf({ product: null, kind: "bridge" })?.id).toBe("bridge-monitoring");
    expect(solutionOf({ product: null, kind: "retail" })).toBeUndefined();
    expect(new Set(SOLUTIONS.map((s) => s.id)).size).toBe(SOLUTIONS.length);
  });
  test("sourcesFor and productsUsing", () => {
    expect(sourcesFor("people-count")[0].kind).toBe("screen");
    expect(sourcesFor("object-detection-dataset")[0].kind).toBe("files");
    const all = [{ id: "people-count" }, { id: "object-detection-dataset" }];
    expect(productsUsing("screen", all)).toEqual([{ id: "people-count" }]);
    expect(productsUsing("files", all)).toHaveLength(2);
  });
  test("suggestSources lists required first, then linked, unlinked before linked", () => {
    const linked = { files: true, screen: false, sensor: false, weather: false };
    const out = suggestSources(["people-count", "object-detection-dataset"], linked, (id) => id.toUpperCase());
    expect(out.map((s) => s.kind)).toEqual(["screen", "files"]);
    expect(out[1]).toEqual({ kind: "files", label: SOURCE_LABEL.files, products: ["PEOPLE-COUNT", "OBJECT-DETECTION-DATASET"], linked: true });
  });
  test("pickable products are the supported ones with their required sources", () => {
    const p = pickableProducts();
    expect(p.length).toBeGreaterThan(0);
    expect(p.find((x) => x.id === "people-count")?.needs).toEqual(["screen or camera share"]);
  });
});

describe("tune", () => {
  test("frequency index falls back to the default slot", () => {
    expect(frequencyIndex(30)).toBe(2);
    expect(frequencyIndex(7)).toBe(1);
    expect(FREQUENCIES[frequencyIndex(DEFAULT_FREQUENCY)].seconds).toBe(DEFAULT_FREQUENCY);
  });
  test("estimate scales cost with sampling rate and clamps level", () => {
    const e = estimate(2, 10);
    expect(e.perHour).toBe(360);
    expect(e.cost).toBeCloseTo((1.8 / 100) * 360);
    expect(estimate(-1, 60).level).toBe("Lean");
    expect(estimate(9, 60).level).toBe("Maximum");
  });
});
