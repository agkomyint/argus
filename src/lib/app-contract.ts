import { signalType } from "@/lib/app-run";
import type { KINDS } from "@/products/kinds";

/**
 * The contract between a data product and a consumer app. A product says what it is (its kind and the
 * Observation types it writes); each kind of app says which products it can read and how many. The Apps
 * dialog uses this to grey out products an app cannot take and to explain why. Plain code, no model.
 */

export type ProductKind = (typeof KINDS)[number];

export const APP_KIND_IDS = ["watcher", "digest", "tracker"] as const;
export type AppKindId = (typeof APP_KIND_IDS)[number];

export type ProductFacts = { id: string; name: string; kind: ProductKind; observationTypes: readonly string[] };

export type AppContract = {
  /** Product kinds this app can read. */
  accepts: readonly ProductKind[];
  min: number;
  max: number;
  /** Why, in words a person can read next to the picker. */
  needs: string;
};

export const CONTRACTS: Record<AppKindId, AppContract> = {
  watcher: { accepts: ["alert", "event-stream", "timeseries"], min: 1, max: 3, needs: "a moment or a number to watch: an alert, an event stream or a time series" },
  digest: { accepts: ["alert", "event-stream", "timeseries", "report", "dataset"], min: 1, max: 6, needs: "anything that can be added up over a period" },
  tracker: { accepts: ["timeseries", "event-stream", "alert"], min: 1, max: 2, needs: "a number that changes over time, so it can have a goal" },
};

/** Why this product cannot go into this kind of app, or null when it fits. */
export function productFit(app: AppKindId, p: ProductFacts): string | null {
  const c = CONTRACTS[app];
  if (!c.accepts.includes(p.kind)) return `A ${app} reads ${c.accepts.join(", ")}. ${p.name} is a ${p.kind}.`;
  // A watcher fires on a rule, and only some Observations have one yet.
  return app === "watcher" && !signalType(p.observationTypes) ? `${p.name} has no alert rule yet.` : null;
}

/** What is wrong with this combination, in order. Empty means the app can be saved. */
export function contractProblems(app: AppKindId, picked: readonly ProductFacts[]): string[] {
  const c = CONTRACTS[app];
  const out: string[] = [];
  if (picked.length < c.min) out.push(`Pick at least ${c.min} data product for this app to read.`);
  if (picked.length > c.max) out.push(`A ${app} reads at most ${c.max} products. Switch one off.`);
  for (const p of picked) {
    const why = productFit(app, p);
    if (why) out.push(why);
  }
  return out;
}

/** Why the app cannot draw a lane on the timeline, or null. A lane needs Observations with a time on them. */
export function timelineProblem(picked: readonly ProductFacts[]): string | null {
  if (!picked.length) return "Pick a data product first; the lane is drawn from what it writes.";
  return picked.some((p) => p.observationTypes.length) ? null : "None of the picked products writes Observations, so there is nothing to place on the timeline.";
}
