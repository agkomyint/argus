import { describe, expect, test } from "bun:test";
import { gapLength, quietGaps } from "@/lib/quiet-gaps";

describe("quiet gaps", () => {
  test("marks a long stretch in the middle, not the edges", () => {
    const spans = [[1000, 2000], [3000, 3500], [60_000, 61_000]] as const;
    expect(quietGaps(spans, 500, 10_000)).toEqual([{ from: 4000, to: 60_000 }]);
  });
  test("leaves room before activity comes back", () => {
    expect(quietGaps([[0, 1000], [60_000, 61_000]], 0, 10_000, 5000)).toEqual([{ from: 1000, to: 55_000 }]);
    expect(quietGaps([[0, 1000], [14_000, 15_000]], 0, 10_000, 5000)).toEqual([]);
  });
  test("overlapping spans close a gap, and short gaps are ignored", () => {
    expect(quietGaps([[0, 50_000], [10_000, 20_000], [55_000, 56_000]], 0, 10_000)).toEqual([]);
  });
  test("one span or none has no middle", () => {
    expect(quietGaps([], 0, 1)).toEqual([]);
    expect(quietGaps([[5, 9]], 0, 1)).toEqual([]);
  });
  test("says how long in words", () => {
    expect([gapLength(40_000), gapLength(12 * 60_000), gapLength(125 * 60_000), gapLength(120 * 60_000)]).toEqual(["40 s", "12 min", "2 h 5 min", "2 h"]);
  });
});

import { shrunkAxis } from "@/lib/quiet-gaps";
describe("shrunk axis", () => {
  test("is straight with no gaps", () => {
    const a = shrunkAxis(0, 1000, []);
    expect([a.x(0), a.x(250), a.x(1000)]).toEqual([0, 25, 100]);
    expect(a.at(50)).toBe(500);
  });
  test("a longer gap is wider than a shorter one, but only a little, and active time keeps one scale", () => {
    const m = 60_000;
    const a = shrunkAxis(0, 200 * m, [{ from: 10 * m, to: 17 * m }, { from: 60 * m, to: 102 * m }]);
    const seven = a.x(17 * m) - a.x(10 * m), forty = a.x(102 * m) - a.x(60 * m);
    expect(forty).toBeGreaterThan(seven);
    expect(forty / seven).toBeLessThan(2.5);
    expect(forty).toBeLessThan(4);
    // 10 minutes of activity is the same width before, between and after the gaps
    expect(a.x(10 * m) - a.x(0)).toBeCloseTo(a.x(27 * m) - a.x(17 * m), 5);
    expect(a.x(27 * m) - a.x(17 * m)).toBeCloseTo(a.x(200 * m) - a.x(190 * m), 5);
    expect(a.x(200 * m)).toBe(100);
    for (const t of [0, 5, 10, 13, 17, 40, 60, 80, 102, 150, 200]) expect(a.at(a.x(t * m))).toBeCloseTo(t * m, 3);
  });
  test("gaps never take more than half the strip", () => {
    const m = 60_000;
    const gaps = Array.from({ length: 50 }, (_, i) => ({ from: (i * 2 + 1) * 1000 * m, to: (i * 2 + 2) * 1000 * m }));
    const a = shrunkAxis(0, 101_000 * m, gaps);
    expect(a.x(1000 * m)).toBeLessThan(50);
    expect(a.x(101_000 * m)).toBe(100);
  });
});

describe("axis outside the window", () => {
  test("carries on past the ends so off-screen marks can be told apart", () => {
    const a = shrunkAxis(1000, 2000, []);
    expect(a.x(500)).toBeCloseTo(-50, 5);
    expect(a.x(2500)).toBeCloseTo(150, 5);
  });
});

describe("zoomed in", () => {
  const m = 60_000;
  const gap = { from: 20 * m, to: 80 * m };
  test("a quiet gap stays small in the window however far you zoom", () => {
    for (const [from, to] of [[0, 200 * m], [15 * m, 90 * m], [18 * m, 25 * m], [75 * m, 85 * m]] as const) {
      const a = shrunkAxis(from, to, [gap]);
      const w = Math.min(100, a.x(Math.min(to, gap.to))) - Math.max(0, a.x(Math.max(from, gap.from)));
      expect(w).toBeLessThan(4);
    }
  });
});
