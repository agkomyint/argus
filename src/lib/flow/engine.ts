import "server-only";
import { generateText, Output } from "ai";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { observations, sourceLanes, sources, timelines, uploads } from "@/db/schema";
import { getProduct } from "@/products";
import { chatModel } from "@/lib/meta";
import { NODE_DEFS, order, validateGraph, type FlowGraph, type FlowNode } from "./types";

export type Row = Record<string, unknown>;

export type NodeTrace = {
  id: string;
  type: string;
  label: string;
  inCount: number;
  outCount: number;
  ms: number;
  note: string;
  sample: Row[];
  error?: string;
};

export type ChartOut = { nodeId: string; kind: "bar" | "line" | "number"; x: string; y: string; data: Row[] };
export type FlowOutput = { charts: ChartOut[]; tables: { nodeId: string; label: string; rows: Row[] }[]; published: { type: string; count: number }[] };

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : null);
const p = (n: FlowNode, k: string) => String(n.params[k] ?? "");
const pn = (n: FlowNode, k: string, d: number) => num(n.params[k]) ?? d;
const near = (a: number, pool: number[]) => pool.some((x) => Math.abs(x - a) <= Math.max(0.011, Math.abs(x) * 0.005));

function compare(a: unknown, op: string, b: string) {
  const an = num(a), bn = num(b);
  if (an !== null && bn !== null) {
    return op === "=" ? an === bn : op === "!=" ? an !== bn : op === ">" ? an > bn : op === ">=" ? an >= bn : op === "<" ? an < bn : op === "<=" ? an <= bn : false;
  }
  const as = String(a ?? "").toLowerCase(), bs = b.toLowerCase();
  return op === "=" ? as === bs : op === "!=" ? as !== bs : op === "contains" ? as.includes(bs) : false;
}

const claimsSchema = z.object({ claims: z.array(z.object({ text: z.string().describe("One factual statement"), numbers: z.array(z.number()).describe("Every number quoted, copied exactly from the rows") })).max(8) });

/** Run one node on its inputs. Pure except for source (reads), agent (calls the model) and publish (writes). */
async function runNode(n: FlowNode, ins: Record<string, Row[]>, ctx: { projectId: string; flowId: string }, out: FlowOutput): Promise<{ rows: Row[]; note: string }> {
  const rows = ins.in ?? [];
  switch (n.type) {
    case "source": {
      const sel = p(n, "timeline").trim();
      const obsType = p(n, "obsType").trim();
      let scope = and(eq(observations.projectId, ctx.projectId), obsType ? eq(observations.type, obsType) : undefined);
      if (sel) {
        const [tls, lns, srcs] = await Promise.all([
          db.select().from(timelines).where(eq(timelines.projectId, ctx.projectId)),
          db.select().from(sourceLanes).where(eq(sourceLanes.projectId, ctx.projectId)),
          db.select().from(sources).where(eq(sources.projectId, ctx.projectId)),
        ]);
        const lane = lns.find((l) => `${tls.find((t) => t.id === l.timelineId)?.name} / ${l.name}` === sel);
        const tl = tls.find((t) => t.name === sel);
        const src = srcs.find((s) => s.name === sel);
        if (lane) scope = and(scope, inArray(observations.uploadId, db.select({ id: uploads.id }).from(uploads).where(eq(uploads.laneId, lane.id))));
        else if (tl) scope = and(scope, inArray(observations.uploadId, db.select({ id: uploads.id }).from(uploads).where(eq(uploads.timelineId, tl.id))));
        else if (src) scope = and(scope, eq(observations.sourceId, src.id));
        else throw new Error(`No source named "${sel}"`);
      }
      const found = await db
        .select()
        .from(observations)
        .where(scope)
        .orderBy(desc(observations.eventTime))
        .limit(Math.min(Math.max(pn(n, "limit", 100), 1), 500));
      return { rows: found.map((o) => ({ id: o.id, type: o.type, time: o.eventTime.toISOString(), confidence: o.confidence, ...o.payload })), note: `${found.length} ${p(n, "obsType")} rows` };
    }
    case "filter": {
      const kept = rows.filter((r) => compare(r[p(n, "field")], p(n, "op"), p(n, "value")));
      return { rows: kept, note: `kept ${kept.length} of ${rows.length} where ${p(n, "field")} ${p(n, "op")} ${p(n, "value")}` };
    }
    case "sort": {
      const f = p(n, "field"), dir = p(n, "direction") === "asc" ? 1 : -1;
      const sorted = [...rows].sort((a, b) => {
        const an = num(a[f]), bn = num(b[f]);
        if (an !== null && bn !== null) return (an - bn) * dir;
        return String(a[f] ?? "").localeCompare(String(b[f] ?? "")) * dir;
      }).slice(0, Math.max(pn(n, "limit", 20), 1));
      return { rows: sorted, note: `top ${sorted.length} by ${f} ${dir === 1 ? "ascending" : "descending"}` };
    }
    case "group": {
      const by = p(n, "groupBy"), metric = p(n, "metric"), f = p(n, "field");
      const buckets = new Map<string, number[]>();
      for (const r of rows) {
        const k = String(r[by] ?? "(none)");
        const v = metric === "count" ? 1 : num(r[f]);
        if (v === null) continue;
        buckets.set(k, [...(buckets.get(k) ?? []), v]);
      }
      const grouped = [...buckets].map(([key, vs]) => {
        const sum = vs.reduce((a, b) => a + b, 0);
        const value = metric === "count" || metric === "sum" ? sum : metric === "avg" ? sum / vs.length : metric === "min" ? Math.min(...vs) : Math.max(...vs);
        return { key, value: Math.round(value * 1000) / 1000, n: vs.length };
      });
      return { rows: grouped, note: `${grouped.length} groups by ${by} (${metric})` };
    }
    case "extract": {
      const fields = p(n, "fields").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 8);
      const slice = rows.slice(0, Math.min(Math.max(pn(n, "limit", 30), 1), 40));
      if (!slice.length || !fields.length) return { rows: [], note: "no rows or no fields" };
      const { output } = await generateText({
        model: chatModel(),
        output: Output.object({ schema: z.object({ records: z.array(z.object({ index: z.number(), values: z.array(z.object({ field: z.string(), value: z.string().describe("empty string when the row does not say") })) })) }) }),
        system: `You extract fields from rows. For each row index return a value for each of these fields: ${fields.join(", ")}. Use ONLY what the row says; use an empty string when it does not. ` + p(n, "prompt"),
        prompt: `ROWS:\n${JSON.stringify(slice.map((r, index) => ({ index, ...r })))}`,
      });
      const out2 = slice.map((r, i) => {
        const rec = output.records.find((x) => x.index === i);
        return { ...r, ...Object.fromEntries(fields.map((f) => [f, rec?.values.find((v) => v.field === f)?.value ?? ""])) };
      });
      return { rows: out2, note: `extracted ${fields.join(", ")} from ${slice.length} rows` };
    }
    case "classify": {
      const labels = p(n, "labels").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 12);
      const slice = rows.slice(0, Math.min(Math.max(pn(n, "limit", 30), 1), 40));
      if (!slice.length || !labels.length) return { rows: [], note: "no rows or no labels" };
      const { output } = await generateText({
        model: chatModel(),
        output: Output.object({ schema: z.object({ results: z.array(z.object({ index: z.number(), label: z.string(), confidence: z.number().describe("0 to 1") })) }) }),
        system: `You classify rows. For each row index choose exactly one label from: ${labels.join(", ")}. If none fit, use "other". ` + p(n, "prompt"),
        prompt: `ROWS:\n${JSON.stringify(slice.map((r, index) => ({ index, ...r })))}`,
      });
      const out2 = slice.map((r, i) => {
        const res = output.results.find((x) => x.index === i);
        const label = res && labels.includes(res.label) ? res.label : "other";
        return { ...r, class: label, class_confidence: res ? Math.min(Math.max(res.confidence, 0), 1) : 0 };
      });
      return { rows: out2, note: `classified ${slice.length} rows into ${new Set(out2.map((r) => r.class)).size} labels` };
    }
    case "track": {
      const by = p(n, "entity"), tf = p(n, "timeField") || "time";
      const groups = new Map<string, Row[]>();
      for (const r of rows) groups.set(String(r[by] ?? "(none)"), [...(groups.get(String(r[by] ?? "(none)")) ?? []), r]);
      const tracks = [...groups].map(([entity, rs]) => {
        const ts = rs.map((r) => Date.parse(String(r[tf] ?? ""))).filter((t) => !Number.isNaN(t));
        const confs = rs.map((r) => num(r.confidence)).filter((x): x is number => x !== null);
        const first = ts.length ? Math.min(...ts) : null, last = ts.length ? Math.max(...ts) : null;
        return {
          entity, count: rs.length,
          first_seen: first ? new Date(first).toISOString() : null, last_seen: last ? new Date(last).toISOString() : null,
          span_minutes: first && last ? Math.round((last - first) / 60000) : 0,
          avg_confidence: confs.length ? Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 1000) / 1000 : null,
          time: first ? new Date(first).toISOString() : null,
        };
      });
      return { rows: tracks, note: `${tracks.length} tracked by ${by}` };
    }
    case "normalize": {
      const f = p(n, "field"), op = p(n, "normOp"), nums = op === "scale 0-1" ? rows.map((r) => num(r[f])).filter((x): x is number => x !== null) : [];
      const lo = nums.length ? Math.min(...nums) : 0, hi = nums.length ? Math.max(...nums) : 1;
      const done = rows.map((r) => {
        const v = r[f];
        let nv: unknown = v;
        if (op === "lowercase") nv = String(v ?? "").toLowerCase();
        else if (op === "trim") nv = String(v ?? "").trim().replace(/\s+/g, " ");
        else if (op === "number") nv = num(v);
        else if (op === "round") { const x = num(v); nv = x === null ? null : Math.round(x * 10 ** pn(n, "digits", 2)) / 10 ** pn(n, "digits", 2); }
        else if (op === "scale 0-1") { const x = num(v); nv = x === null ? null : hi === lo ? 0 : Math.round(((x - lo) / (hi - lo)) * 1000) / 1000; }
        else if (op === "iso time") { const t = Date.parse(String(v ?? "")); nv = Number.isNaN(t) ? null : new Date(t).toISOString(); }
        return { ...r, [f]: nv };
      });
      return { rows: done, note: `${op} on ${f} for ${done.length} rows` };
    }
    case "validate": {
      const f = p(n, "field"), rule = p(n, "rule"), val = p(n, "value");
      const check = (r: Row) => {
        const v = r[f];
        if (rule === "not empty") return v !== null && v !== undefined && String(v).trim() !== "" ? null : `${f} is empty`;
        if (rule === "at least") return num(v) !== null && num(v)! >= Number(val) ? null : `${f} is below ${val}`;
        if (rule === "at most") return num(v) !== null && num(v)! <= Number(val) ? null : `${f} is above ${val}`;
        return val.split(",").map((x) => x.trim().toLowerCase()).includes(String(v ?? "").toLowerCase()) ? null : `${f} is not one of ${val}`;
      };
      const flagged = rows.map((r) => ({ r, why: check(r) }));
      const keep = p(n, "mode") === "keep and flag" ? flagged.map(({ r, why }) => ({ ...r, valid: !why, invalid_reason: why ?? "" })) : flagged.filter((x) => !x.why).map((x) => x.r);
      return { rows: keep, note: `${flagged.filter((x) => !x.why).length} of ${rows.length} passed: ${f} ${rule} ${val}` };
    }
    case "fuse": {
      const a = ins.a ?? [], b = ins.b ?? [], key = p(n, "joinKey").trim(), win = Math.max(pn(n, "windowMin", 10), 0) * 60000;
      const bt = b.map((r) => ({ r, t: Date.parse(String(r.time ?? "")) }));
      const fused: Row[] = [];
      for (const ar of a) {
        const at = Date.parse(String(ar.time ?? ""));
        let best: { r: Row; t: number } | null = null;
        for (const c of bt) {
          if (Number.isNaN(at) || Number.isNaN(c.t) || Math.abs(c.t - at) > win) continue;
          if (key && String(c.r[key] ?? "") !== String(ar[key] ?? "")) continue;
          if (!best || Math.abs(c.t - at) < Math.abs(best.t - at)) best = c;
        }
        if (best) fused.push({ ...ar, ...Object.fromEntries(Object.entries(best.r).filter(([k]) => k !== "id").map(([k, v]) => [`b_${k}`, v])), gap_minutes: Math.round(Math.abs(best.t - at) / 600) / 100 });
        else if (p(n, "unmatched") === "keep") fused.push(ar);
      }
      return { rows: fused, note: `${fused.length} fused from ${a.length} + ${b.length} rows within ${win / 60000} min` };
    }
    case "layer": {
      const keep = p(n, "keepFields").split(",").map((x) => x.trim()).filter(Boolean);
      const name = p(n, "layerName") || "unified";
      const layered = rows.map((r) => ({ layer: name, ...(keep.length ? Object.fromEntries(Object.entries(r).filter(([k]) => keep.includes(k) || k === "time" || k === "confidence")) : r) }));
      return { rows: layered, note: `layer "${name}" with ${layered.length} rows` };
    }
    case "agent": {
      const slice = rows.slice(0, Math.min(Math.max(pn(n, "limit", 30), 1), 60));
      if (!slice.length) return { rows: [], note: "no rows to read" };
      const { output } = await generateText({
        model: chatModel(),
        output: Output.object({ schema: claimsSchema }),
        system: "You analyse rows of data. Use ONLY the ROWS given. Quote numbers exactly as they appear. Do not invent values or causes. " + p(n, "prompt"),
        prompt: `ROWS:\n${JSON.stringify(slice)}`,
      });
      return { rows: output.claims.map((c) => ({ text: c.text, numbers: c.numbers })), note: `${output.claims.length} claims from ${slice.length} rows` };
    }
    case "factcheck": {
      const pool: number[] = [];
      for (const r of ins.ref ?? []) for (const v of Object.values(r)) { const x = num(v); if (x !== null) pool.push(x); }
      const checked = rows.map((r) => {
        const text = String(r.text ?? "");
        const listed = Array.isArray(r.numbers) ? (r.numbers as unknown[]).map(num).filter((x): x is number => x !== null) : [];
        const bad = listed.find((x) => !near(x, pool));
        const unlisted = listed.length === 0 && /\d/.test(text);
        const reason = !pool.length ? "no evidence rows connected" : bad !== undefined ? `number ${bad} is not in the evidence` : unlisted ? "quotes digits without listing them" : "every number found in the evidence";
        return { ...r, verified: !bad && !unlisted && pool.length > 0, reason };
      });
      const kept = p(n, "keep") === "everything" ? checked : checked.filter((r) => r.verified);
      return { rows: kept, note: `${checked.filter((r) => r.verified).length} of ${checked.length} claims verified against ${pool.length} numbers` };
    }
    case "chart": {
      const kind = (["bar", "line", "number"].includes(p(n, "kind")) ? p(n, "kind") : "bar") as ChartOut["kind"];
      out.charts.push({ nodeId: n.id, kind, x: p(n, "x"), y: p(n, "y"), data: rows.slice(0, 200) });
      return { rows, note: `${kind} of ${rows.length} rows` };
    }
    case "publish": {
      const prod = getProduct(p(n, "product"));
      const type = prod?.observationTypes[0] ?? (p(n, "publishType").toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 40) || "flow_output");
      // Re-running replaces this flow's earlier output instead of piling up duplicates.
      const old = await db.select({ id: observations.id, prov: observations.provenance }).from(observations).where(and(eq(observations.projectId, ctx.projectId), eq(observations.type, type)));
      for (const o of old) if (o.prov.flowId === ctx.flowId) await db.delete(observations).where(eq(observations.id, o.id));
      if (rows.length) {
        await db.insert(observations).values(
          rows.slice(0, 500).map((r) => ({
            projectId: ctx.projectId,
            type,
            eventTime: typeof r.time === "string" && !Number.isNaN(Date.parse(r.time)) ? new Date(r.time) : new Date(),
            confidence: num(r.confidence),
            payload: r,
            provenance: { flowId: ctx.flowId, node: n.id },
          })),
        );
      }
      out.published.push({ type, count: Math.min(rows.length, 500) });
      return { rows, note: `saved ${Math.min(rows.length, 500)} rows as ${type}` };
    }
  }
}

/** Run a whole graph in dependency order. A failing node stops its downstream, not the whole report. */
export async function runGraph(graph: FlowGraph, ctx: { projectId: string; flowId: string }) {
  const problem = validateGraph(graph);
  if (problem) throw new Error(problem);
  const results = new Map<string, Row[]>();
  const failed = new Set<string>();
  const trace: NodeTrace[] = [];
  const out: FlowOutput = { charts: [], tables: [], published: [] };

  for (const id of order(graph)!) {
    const n = graph.nodes.find((x) => x.id === id)!;
    const def = NODE_DEFS[n.type];
    const incoming = graph.edges.filter((e) => e.to === id);
    if (incoming.some((e) => failed.has(e.from))) {
      failed.add(id);
      trace.push({ id, type: n.type, label: def.label, inCount: 0, outCount: 0, ms: 0, note: "skipped: an earlier node failed", sample: [] });
      continue;
    }
    const ins: Record<string, Row[]> = {};
    for (const e of incoming) ins[e.port] = [...(ins[e.port] ?? []), ...(results.get(e.from) ?? [])];
    const inCount = Object.values(ins).reduce((s, r) => s + r.length, 0);
    const t0 = Date.now();
    try {
      const r = await runNode(n, ins, ctx, out);
      results.set(id, r.rows);
      trace.push({ id, type: n.type, label: def.label, inCount, outCount: r.rows.length, ms: Date.now() - t0, note: r.note, sample: r.rows.slice(0, 3) });
      if (!def.hasOutput || !graph.edges.some((e) => e.from === id)) out.tables.push({ nodeId: id, label: def.label, rows: r.rows.slice(0, 100) });
    } catch (e) {
      failed.add(id);
      trace.push({ id, type: n.type, label: def.label, inCount, outCount: 0, ms: Date.now() - t0, note: "failed", sample: [], error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { trace, output: out };
}
