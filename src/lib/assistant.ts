import type { UIMessage } from "ai";
import { num, type Dataset } from "@/lib/product-types";

/** What the chat knows about one project: enough to list it under @ and to scope a question. */
export type AskProject = { id: string; name: string; kind: string; products: string[] };

/** Metadata on a user message: the projects it was @-mentioned with. Empty means "all my projects". */
export type AskMeta = { mentions?: string[] };
export type AskMessage = UIMessage<AskMeta>;

/** Each tool's friendly label in the chat, so the UI says what was looked up instead of a function name. */
export const TOOL_LABELS: Record<string, string> = {
  listProjects: "Read your projects",
  describeProduct: "Computed a data product",
  listObservations: "Read observations",
  listAlerts: "Checked alerts",
  listFiles: "Listed files",
};

/** The project ids a conversation is scoped to: the latest user message's @-mentions, kept to ones the user owns. */
export function scopeOf(messages: AskMessage[], owned: readonly string[]): string[] {
  const last = [...messages].reverse().find((m) => m.role === "user");
  const wanted = last?.metadata?.mentions ?? [];
  const mine = wanted.filter((id) => owned.includes(id));
  return mine.length ? [...new Set(mine)] : [...owned];
}

type FieldStats = { min: number; max: number; mean: number; last: number };

/**
 * A dataset summarised by code, never by the model: counts, time span, the busiest hour and
 * min / max / mean / latest of every numeric payload field. The model only words the result.
 */
export function describeDataset(ds: Dataset) {
  const rows = ds.rows;
  const fields: Record<string, FieldStats> = {};
  const keys = new Set(rows.flatMap((r) => Object.keys(r.payload).filter((k) => typeof r.payload[k] === "number")));
  for (const k of keys) {
    const vals = rows.filter((r) => typeof r.payload[k] === "number").map((r) => num(r.payload[k]));
    if (!vals.length) continue;
    const sum = vals.reduce((a, v) => a + v, 0);
    fields[k] = { min: Math.min(...vals), max: Math.max(...vals), mean: round(sum / vals.length), last: vals.at(-1)! };
  }
  const hours = new Map<number, number>();
  for (const r of rows) hours.set(new Date(r.t).getUTCHours(), (hours.get(new Date(r.t).getUTCHours()) ?? 0) + 1);
  const peak = [...hours].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  return {
    type: ds.type,
    totalRows: ds.total,
    rowsSummarised: rows.length,
    from: rows[0] ? new Date(rows[0].t).toISOString() : null,
    to: rows.at(-1) ? new Date(rows.at(-1)!.t).toISOString() : null,
    busiestHourUtc: peak ? { hour: peak[0], rows: peak[1] } : null,
    fields,
  };
}

const round = (v: number) => Math.round(v * 100) / 100;

/** Starter questions, picked to fit what is in scope. */
export function starters(scope: AskProject[]): string[] {
  if (scope.length === 1) {
    const p = scope[0];
    const first = p.products[0];
    return [
      first ? `What does ${first} show so far?` : `What is set up in ${p.name}?`,
      `Any alerts in ${p.name}?`,
      `When was ${p.name} busiest?`,
      `Which files feed ${p.name}?`,
    ];
  }
  return ["What am I tracking across my projects?", "Which project has the most data?", "Any alerts I should look at?", "Compare my projects"];
}
