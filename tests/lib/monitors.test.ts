import { describe, expect, test } from "bun:test";
import { filterMonitors, latestLane, monitorOf, monitorsAt, neighbour, pageCount, pageHolding, pageOf } from "@/lib/monitors";
import type { TlItem, TlLane } from "@/lib/studio-timeline-types";

const item = (id: string, t: number): TlItem => ({ id, kind: "file", t, done: t, state: "done", label: id, steps: [], rows: [] });
const lane = (id: string, name: string, items: TlItem[], extra: Partial<TlLane> = {}): TlLane => ({ id, name, input: "files", analyzer: "objects", feeds: [], items, ...extra });
const media = (i: TlItem) => (i.id.startsWith("m") ? `pic-${i.id}` : null);

describe("monitorOf", () => {
  test("each lane shows its own newest item at the playhead", () => {
    const a = lane("a", "Video", [item("a1", 10), item("a2", 20), item("a3", 90)]);
    const m = monitorOf(a, 25, () => null);
    expect(m.item?.id).toBe("a2");
    expect(m.seen).toBe(2);
    expect(m.state).toBe("live");
  });
  test("a lane with nothing yet is empty, not broken", () => {
    const m = monitorOf(lane("a", "A", [item("a1", 50)]), 10, () => null);
    expect(m).toMatchObject({ item: null, media: null, seen: 0, state: "empty" });
  });
  test("an item with a picture wins over a newer one without", () => {
    const m = monitorOf(lane("a", "A", [item("m1", 10), item("x2", 20)]), 30, media);
    expect(m.item?.id).toBe("m1");
    expect(m.media).toBe("pic-m1");
  });
  test("a locked lane shows nothing but still counts what came in", () => {
    const m = monitorOf(lane("a", "Body", [item("a1", 1), item("a2", 2)], { locked: true }), 5, media);
    expect(m).toMatchObject({ state: "locked", item: null, seen: 2 });
  });
  test("monitorsAt makes one per lane, in order", () => {
    expect(monitorsAt([lane("a", "A", []), lane("b", "B", [])], 0, media).map((m) => m.lane.id)).toEqual(["a", "b"]);
  });
});

describe("latestLane", () => {
  test("is the lane that changed most recently", () => {
    const ms = monitorsAt([lane("a", "A", [item("a1", 10)]), lane("b", "B", [item("b1", 40)]), lane("c", "C", [])], 50, () => null);
    expect(latestLane(ms)).toBe("b");
  });
  test("is null when nothing has come in", () => {
    expect(latestLane(monitorsAt([lane("a", "A", [])], 0, () => null))).toBeNull();
  });
});

describe("filterMonitors", () => {
  const ms = monitorsAt([lane("a", "Launch video", []), lane("b", "Mission audio", [], { analyzer: "speech" }), lane("c", "Launch photos", [])], 0, () => null);
  test("empty filter keeps all", () => expect(filterMonitors(ms, "  ")).toHaveLength(3));
  test("every word must match name, input or analyzer", () => {
    expect(filterMonitors(ms, "launch").map((m) => m.lane.id)).toEqual(["a", "c"]);
    expect(filterMonitors(ms, "launch photos").map((m) => m.lane.id)).toEqual(["c"]);
    expect(filterMonitors(ms, "speech").map((m) => m.lane.id)).toEqual(["b"]);
    expect(filterMonitors(ms, "zzz")).toEqual([]);
  });
});

describe("paging", () => {
  const xs = Array.from({ length: 25 }, (_, i) => i);
  test("pageCount is at least one", () => { expect(pageCount(0, 6)).toBe(1); expect(pageCount(25, 6)).toBe(5); expect(pageCount(3, 0)).toBe(3); });
  test("pageOf slices and clamps", () => {
    expect(pageOf(xs, 0, 10)).toMatchObject({ page: 0, pages: 3, items: xs.slice(0, 10) });
    expect(pageOf(xs, 2, 10).items).toHaveLength(5);
    expect(pageOf(xs, 99, 10).page).toBe(2);
    expect(pageOf(xs, -4, 10).page).toBe(0);
    expect(pageOf([], 3, 10)).toMatchObject({ page: 0, pages: 1, items: [] });
  });
  test("pageHolding finds the page of a lane", () => {
    expect(pageHolding(["a", "b", "c", "d"], "d", 2)).toBe(1);
    expect(pageHolding(["a"], null, 2)).toBe(0);
    expect(pageHolding(["a"], "zz", 2)).toBe(0);
  });
});

describe("neighbour", () => {
  const ids = ["a", "b", "c"];
  test("moves and stops at the ends", () => {
    expect(neighbour(ids, "a", 1)).toBe("b");
    expect(neighbour(ids, "c", 1)).toBe("c");
    expect(neighbour(ids, "a", -1)).toBe("a");
  });
  test("with nothing focused, next starts at the first and previous at the last", () => {
    expect(neighbour(ids, null, 1)).toBe("a");
    expect(neighbour(ids, "gone", -1)).toBe("c");
  });
  test("no lanes, no neighbour", () => expect(neighbour([], "a", 1)).toBeNull());
});
