import { describe, expect, test } from "bun:test";
import { spread, verifyIncidents } from "@/lib/incident-math";

const p = (frame: number, kind = "impact", confidence = 0.8) => ({ frame, kind, description: "x", confidence });
const times = [0, 2000, 4000, 6000, 8000];

describe("verifyIncidents", () => {
  test("maps frame numbers to times and sorts by time", () => {
    const { kept } = verifyIncidents([p(4, "fire"), p(2)], times);
    expect(kept.map((k) => [k.kind, k.atMs])).toEqual([["impact", 2000], ["fire", 6000]]);
  });
  test("drops frames that do not exist, weak guesses and repeats", () => {
    const { kept, dropped } = verifyIncidents([p(9), p(0), p(2), p(3), p(5, "smoke", 0.1)], times);
    expect(kept).toHaveLength(1);
    expect(dropped.map((d) => d.why).sort()).toEqual(["low confidence", "no such frame", "no such frame", "repeat"]);
  });
  test("the same kind far apart is two incidents", () => {
    expect(verifyIncidents([p(1), p(5)], times).kept).toHaveLength(2);
  });
});

describe("spread", () => {
  test("keeps everything when it fits, else spreads evenly with both ends", () => {
    expect(spread(3, 5)).toEqual([0, 1, 2]);
    const s = spread(100, 5);
    expect(s).toHaveLength(5);
    expect([s[0], s[4]]).toEqual([0, 99]);
  });
});
