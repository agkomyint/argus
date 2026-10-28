import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { db } from "@/db";
import { traces } from "@/db/schema";

/**
 * The observatory. Every model call, code step and model-chosen tool call goes through traced(), which
 * writes one row to `traces` with what went in, what came out, how long it took and the tokens it used.
 * Who and what it belongs to (project, job, upload) is carried by withTrace() so callers stay small.
 */

export type TraceKind = "model" | "code" | "tool";
type TraceCtx = { projectId?: string | null; userId?: string | null; jobId?: string | null; uploadId?: string | null };

const store = new AsyncLocalStorage<TraceCtx>();

/** Run fn with this context added to every trace it writes. Nested calls keep the outer context. */
export function withTrace<T>(ctx: TraceCtx, fn: () => T): T {
  return store.run({ ...store.getStore(), ...ctx }, fn);
}

const MAX_TEXT = 1200;
const MAX_ITEMS = 40;

/** Keep a trace readable and small: bytes become a size, long text is cut, long lists are capped. */
export function small(v: unknown, depth = 0): unknown {
  if (v == null || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "string") return v.length > MAX_TEXT ? `${v.slice(0, MAX_TEXT)}… (${v.length} chars)` : v;
  if (v instanceof Uint8Array || v instanceof ArrayBuffer) return { bytes: v.byteLength };
  if (v instanceof Date) return v.toISOString();
  if (depth > 5) return "…";
  if (Array.isArray(v)) {
    const out = v.slice(0, MAX_ITEMS).map((x) => small(x, depth + 1));
    return v.length > MAX_ITEMS ? [...out, `… ${v.length - MAX_ITEMS} more`] : out;
  }
  if (typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, small(x, depth + 1)]));
  return String(v);
}

export type Step<T> = {
  kind: TraceKind;
  name: string;
  model?: string | null;
  input?: unknown;
  /** What to record from the result. Defaults to the result itself, made small. */
  output?: (r: T) => unknown;
  usage?: (r: T) => { inputTokens?: number; outputTokens?: number } | undefined;
  observations?: (r: T) => string[];
};

export type TraceRow = typeof traces.$inferInsert;

/** Write one trace row now, for steps whose timing is measured elsewhere (a streamed chat reply). */
export async function writeTrace(row: Omit<TraceRow, "projectId" | "userId" | "jobId" | "uploadId"> & TraceCtx) {
  const ctx = store.getStore() ?? {};
  try {
    await db.insert(traces).values({
      ...row,
      projectId: row.projectId ?? ctx.projectId ?? null,
      userId: row.userId ?? ctx.userId ?? null,
      jobId: row.jobId ?? ctx.jobId ?? null,
      uploadId: row.uploadId ?? ctx.uploadId ?? null,
      input: small(row.input),
      output: small(row.output),
    });
  } catch (e) {
    // A trace that cannot be written must never break the work it describes.
    console.error("trace write failed", row.name, e);
  }
}

/** Run one step and record it, whether it succeeds or throws. The error is re-thrown unchanged. */
export async function traced<T>(step: Step<T>, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  const base = { kind: step.kind, name: step.name, model: step.model ?? null, input: step.input };
  try {
    const r = await fn();
    const usage = step.usage?.(r);
    await writeTrace({
      ...base,
      status: "ok",
      ms: Math.round(performance.now() - t0),
      output: step.output ? step.output(r) : r,
      tokensIn: usage?.inputTokens ?? null,
      tokensOut: usage?.outputTokens ?? null,
      observationIds: step.observations?.(r) ?? [],
    });
    return r;
  } catch (e) {
    await writeTrace({ ...base, status: "error", ms: Math.round(performance.now() - t0), error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

export const MODEL_ID = () => process.env.META_MODEL ?? "muse-spark-1.3";
