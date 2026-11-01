import type { AppKindId } from "@/lib/app-contract";
import type { Dataset } from "@/lib/product-types";

/**
 * Runs a consumer app over a product's rows. Plain code, no model: a rule is a number the person set, a row either
 * passes it or not. Alerts are worked out from the data every time they are shown, so the same data always gives
 * the same alerts, a shared replay needs no stored copy, and nothing here costs a model call.
 */

export type Severity = "low" | "medium" | "high";

export type AppRule = {
  /** The dial for each product the app reads, in that product's own unit. */
  dials: Record<string, number>;
  severity: Severity;
  /** After an alert, the same product stays quiet for this many minutes. */
  cooldownMin: number;
  /** Also raise a browser notification when an alert arrives. The alert is always kept in Delivery. */
  browserAlert: boolean;
};

export type AppConfig = { id: string; name: string; kind: AppKindId; reads: string[]; rule: AppRule; on: boolean; onTimeline: boolean };

export type AppAlert = {
  id: string;
  appId: string;
  appName: string;
  productId: string;
  productName: string;
  /** The Observation that tripped the rule, so the studio can find the frame or file it came from. */
  rowId: string;
  /** Where in the video the frame was, in ms, when the row came from a sampled frame. Null for rows that are not a frame. */
  frameMs: number | null;
  /** When the row arrived. The replay clock and the timeline use this. */
  at: number;
  severity: Severity;
  label: string;
  /** Why it fired, in words: the number against the rule. */
  why: string;
};

/** The second of the video a row was read from: set on rows from a sampled frame. */
export const frameMs = (payload: Record<string, unknown>) => (payload.at_ms != null && Number.isFinite(Number(payload.at_ms)) ? Number(payload.at_ms) : null);

/** What a kind of Observation can be watched for. */
export type Signal = {
  /** How the dial reads: "more than 3 people". */
  dial: { label: string; unit: string; value: number };
  hit: (payload: Record<string, unknown>, dial: number) => { label: string; why: string } | null;
};

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const SIGNALS: Record<string, Signal> = {
  people_count: {
    dial: { label: "more than", unit: "people", value: 3 },
    hit: (p, dial) => (n(p.count) > dial ? { label: `${n(p.count)} people`, why: `${n(p.count)} people in one frame, more than ${dial}` } : null),
  },
  shelf_event: {
    dial: { label: "held at least", unit: "s", value: 20 },
    hit: (p, dial) => {
      const s = Math.round(n(p.held_ms) / 1000);
      return p.outcome === "carried_out" && s >= dial ? { label: `Held ${s} s, left`, why: `Carried out after ${s} s, at least ${dial} s` } : null;
    },
  },
};

/** The Observation type of a product that an app can watch, or null when none has a rule yet. */
export const signalType = (observationTypes: readonly string[]) => observationTypes.find((t) => t in SIGNALS) ?? null;

export type AppData = { id: string; name: string; data: Dataset[] };

/** The alerts one app raises over the data it has, oldest first. */
export function runApp(app: AppConfig, products: readonly AppData[]): AppAlert[] {
  if (!app.on || app.kind !== "watcher") return [];
  const out: AppAlert[] = [];
  for (const id of app.reads) {
    const product = products.find((p) => p.id === id);
    if (!product) continue;
    const type = signalType(product.data.map((d) => d.type));
    if (!type) continue;
    const signal = SIGNALS[type];
    const dial = app.rule.dials[id] ?? signal.dial.value;
    let quietUntil = -Infinity;
    const rows = product.data.filter((d) => d.type === type).flatMap((d) => d.rows).sort((a, b) => a.arrived - b.arrived);
    for (const row of rows) {
      if (row.arrived < quietUntil) continue;
      const hit = signal.hit(row.payload, dial);
      if (!hit) continue;
      quietUntil = row.arrived + app.rule.cooldownMin * 60_000;
      out.push({ id: `${app.id}:${row.id}`, appId: app.id, appName: app.name, productId: id, productName: product.name, rowId: row.id, frameMs: frameMs(row.payload), at: row.arrived, severity: app.rule.severity, ...hit });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Every app's alerts together, oldest first. */
export const alertsOf = (apps: readonly AppConfig[], products: readonly AppData[]) => apps.flatMap((a) => runApp(a, products)).sort((a, b) => a.at - b.at);

/** The alerts the playhead passed between two moments: after `from`, up to and including `to`. */
export const crossed = (alerts: readonly AppAlert[], from: number, to: number) => alerts.filter((a) => a.at > from && a.at <= to);

/** The alerts that should raise a browser notification as the playhead moves from `from` to `to`: only apps that asked for one, and never the same alert twice. */
export function toNotify(alerts: readonly AppAlert[], apps: readonly AppConfig[], from: number, to: number, seen: ReadonlySet<string>) {
  const loud = new Set(apps.filter((a) => a.rule.browserAlert).map((a) => a.id));
  return crossed(alerts, from, to).filter((a) => loud.has(a.appId) && !seen.has(a.id));
}
