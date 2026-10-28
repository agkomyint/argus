import { describe, expect, test } from "bun:test";
import { describeDataset, scopeOf, starters, type AskMessage } from "@/lib/assistant";

const user = (mentions?: string[]): AskMessage => ({ id: crypto.randomUUID(), role: "user", metadata: { mentions }, parts: [{ type: "text", text: "hi" }] });

describe("scopeOf", () => {
  const owned = ["a", "b", "c"];

  test("no mention means every project", () => {
    expect(scopeOf([user()], owned)).toEqual(owned);
  });

  test("uses the latest user message's mentions", () => {
    expect(scopeOf([user(["a"]), user(["b", "c"])], owned)).toEqual(["b", "c"]);
  });

  test("drops projects the user does not own", () => {
    expect(scopeOf([user(["a", "zzz"])], owned)).toEqual(["a"]);
    expect(scopeOf([user(["zzz"])], owned)).toEqual(owned);
  });

  test("dedupes", () => {
    expect(scopeOf([user(["a", "a"])], owned)).toEqual(["a"]);
  });
});

describe("describeDataset", () => {
  const at = (h: number, m = 0) => Date.UTC(2026, 9, 26, h, m);
  const rows = [
    { id: "1", type: "person_count", t: at(7), arrived: at(7), payload: { count: 4, label: "x" } },
    { id: "2", type: "person_count", t: at(8), arrived: at(8), payload: { count: 10 } },
    { id: "3", type: "person_count", t: at(8, 30), arrived: at(8, 30), payload: { count: 7 } },
  ];

  test("computes stats, span and busiest hour from rows", () => {
    const d = describeDataset({ type: "person_count", total: 40, latest: at(8, 30), rows });
    expect(d.totalRows).toBe(40);
    expect(d.rowsSummarised).toBe(3);
    expect(d.from).toBe(new Date(at(7)).toISOString());
    expect(d.to).toBe(new Date(at(8, 30)).toISOString());
    expect(d.busiestHourUtc).toEqual({ hour: 8, rows: 2 });
    expect(d.fields).toEqual({ count: { min: 4, max: 10, mean: 7, last: 7 } });
  });

  test("an empty dataset says so instead of inventing numbers", () => {
    const d = describeDataset({ type: "person_count", total: 0, latest: null, rows: [] });
    expect(d).toMatchObject({ totalRows: 0, from: null, to: null, busiestHourUtc: null, fields: {} });
  });
});

test("starters fit the scope", () => {
  expect(starters([{ id: "a", name: "Harbor", kind: "Bridge", products: ["People count"] }])[0]).toContain("People count");
  expect(starters([])).toHaveLength(4);
});
