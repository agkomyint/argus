/**
 * The arithmetic behind the shelf-interaction product. Models only report what happened at a shelf
 * (a person entered a zone, picked something up, put it back, paid, left). Everything that measures
 * time or decides to flag is plain code here, so the same events always give the same answer.
 */

export type ShelfEventKind = "enter_zone" | "pickup" | "putback" | "checkout" | "exit";

/** One thing seen or read: `person` is an anonymous track id for one recording, never an identity. */
export type ShelfEvent = { t: number; person: string; kind: ShelfEventKind; item?: string; zone?: string };

export type ShelfOutcome = "returned" | "paid" | "carried_out" | "in_store";

export type ShelfInteraction = {
  person: string;
  item: string;
  zone: string;
  /** When the item was picked up. */
  t: number;
  /** Time spent in the zone before the pickup. */
  dwell_ms: number;
  /** Time the item was held until it was returned, paid for, carried out, or the events ended. */
  held_ms: number;
  outcome: ShelfOutcome;
  flagged: boolean;
  reason: string;
};

export type ShelfRule = { minHeldMs: number };
export const DEFAULT_SHELF_RULE: ShelfRule = { minHeldMs: 20_000 };

const secs = (ms: number) => `${Math.round(ms / 1000)}s`;

const SETTLED: Record<Exclude<ShelfOutcome, "carried_out">, string> = {
  returned: "Put back on the shelf",
  paid: "Paid before leaving",
  in_store: "Still in the store",
};

/** Flag only an item carried out of the store, unpaid, after being held at least `minHeldMs`. */
export function judge(outcome: ShelfOutcome, heldMs: number, rule: ShelfRule): { flagged: boolean; reason: string } {
  if (outcome !== "carried_out") return { flagged: false, reason: SETTLED[outcome] };
  if (heldMs < rule.minHeldMs) return { flagged: false, reason: `Left with it, but held only ${secs(heldMs)} (rule: ${secs(rule.minHeldMs)})` };
  return { flagged: true, reason: `Held ${secs(heldMs)}, no checkout, left the store` };
}

/** Join one recording's events into one row per pickup, oldest pickup first. */
export function interactionsOf(events: ShelfEvent[], rule: ShelfRule = DEFAULT_SHELF_RULE): ShelfInteraction[] {
  const sorted = [...events].sort((a, b) => a.t - b.t);
  const end = sorted.length ? sorted[sorted.length - 1].t : 0;
  type Open = { item: string; zone: string; t: number; dwell: number };
  const entered = new Map<string, { zone: string; t: number }>();
  const open = new Map<string, Open[]>();
  const out: ShelfInteraction[] = [];

  const close = (person: string, outcome: ShelfOutcome, at: number, only?: string) => {
    const keep: Open[] = [];
    for (const o of open.get(person) ?? []) {
      if (only !== undefined && o.item !== only) { keep.push(o); continue; }
      const held = Math.max(0, at - o.t);
      out.push({ person, item: o.item, zone: o.zone, t: o.t, dwell_ms: o.dwell, held_ms: held, outcome, ...judge(outcome, held, rule) });
    }
    open.set(person, keep);
  };

  for (const e of sorted) {
    if (e.kind === "enter_zone") entered.set(e.person, { zone: e.zone ?? "unknown", t: e.t });
    else if (e.kind === "pickup") {
      const z = entered.get(e.person);
      open.set(e.person, [...(open.get(e.person) ?? []), { item: e.item ?? "item", zone: e.zone ?? z?.zone ?? "unknown", t: e.t, dwell: z ? Math.max(0, e.t - z.t) : 0 }]);
    } else if (e.kind === "putback") close(e.person, "returned", e.t, e.item ?? "item");
    else if (e.kind === "checkout") close(e.person, "paid", e.t);
    else close(e.person, "carried_out", e.t);
  }
  for (const person of [...open.keys()]) close(person, "in_store", end);
  return out.sort((a, b) => a.t - b.t);
}
