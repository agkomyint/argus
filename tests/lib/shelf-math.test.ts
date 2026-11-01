import { describe, expect, test } from "bun:test";
import { DEFAULT_SHELF_RULE, interactionsOf, judge, type ShelfEvent } from "@/lib/shelf-math";

const S = 1000;

describe("shelf interactions", () => {
  test("put back, paid, carried out and short carry-out each get the right outcome", () => {
    const events: ShelfEvent[] = [
      { t: 0, person: "1", kind: "enter_zone", zone: "A" }, { t: 14 * S, person: "1", kind: "pickup", item: "Jacket" }, { t: 31 * S, person: "1", kind: "putback", item: "Jacket" },
      { t: 20 * S, person: "2", kind: "enter_zone", zone: "B" }, { t: 40 * S, person: "2", kind: "pickup", item: "Headphones" }, { t: 100 * S, person: "2", kind: "checkout" },
      { t: 50 * S, person: "3", kind: "enter_zone", zone: "B" }, { t: 72 * S, person: "3", kind: "pickup", item: "Watch" }, { t: 130 * S, person: "3", kind: "exit" },
      { t: 90 * S, person: "4", kind: "enter_zone", zone: "C" }, { t: 100 * S, person: "4", kind: "pickup", item: "Gum" }, { t: 105 * S, person: "4", kind: "exit" },
    ];
    const rows = interactionsOf(events);
    expect(rows.map((r) => [r.person, r.outcome, r.flagged])).toEqual([
      ["1", "returned", false], ["2", "paid", false], ["3", "carried_out", true], ["4", "carried_out", false],
    ]);
    expect(rows[0]).toMatchObject({ item: "Jacket", zone: "A", dwell_ms: 14 * S, held_ms: 17 * S });
    expect(rows[2]).toMatchObject({ held_ms: 58 * S, dwell_ms: 22 * S, reason: "Held 58s, no checkout, left the store" });
    expect(rows[3].reason).toContain("held only 5s");
  });

  test("unsorted events give the same answer, and unfinished pickups stay in the store", () => {
    const events: ShelfEvent[] = [
      { t: 30 * S, person: "1", kind: "pickup", item: "Cap", zone: "D" },
      { t: 10 * S, person: "1", kind: "enter_zone", zone: "D" },
      { t: 50 * S, person: "2", kind: "enter_zone" },
    ];
    expect(interactionsOf(events)).toEqual([{ person: "1", item: "Cap", zone: "D", t: 30 * S, dwell_ms: 20 * S, held_ms: 20 * S, outcome: "in_store", flagged: false, reason: "Still in the store" }]);
  });

  test("defaults for missing zone, item and entry", () => {
    const rows = interactionsOf([{ t: 0, person: "9", kind: "pickup" }, { t: 5 * S, person: "9", kind: "exit" }]);
    expect(rows[0]).toMatchObject({ item: "item", zone: "unknown", dwell_ms: 0, held_ms: 5 * S });
    expect(interactionsOf([])).toEqual([]);
  });

  test("a putback only closes the matching item, and the threshold is configurable", () => {
    const events: ShelfEvent[] = [
      { t: 0, person: "1", kind: "pickup", item: "A" }, { t: 1 * S, person: "1", kind: "pickup", item: "B" },
      { t: 3 * S, person: "1", kind: "putback", item: "A" }, { t: 8 * S, person: "1", kind: "exit" },
    ];
    expect(interactionsOf(events).map((r) => [r.item, r.outcome])).toEqual([["A", "returned"], ["B", "carried_out"]]);
    expect(interactionsOf(events, { minHeldMs: 5 * S }).find((r) => r.item === "B")?.flagged).toBe(true);
    expect(judge("carried_out", DEFAULT_SHELF_RULE.minHeldMs, DEFAULT_SHELF_RULE).flagged).toBe(true);
  });
});
