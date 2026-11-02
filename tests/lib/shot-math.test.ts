import { describe, expect, test } from "bun:test";
import { distance, findCuts, footageShare, middleFrameMs, shotsOf, type SampledFrame } from "@/lib/shot-math";

const flat = (v: number, n = 12) => Array<number>(n).fill(v);
const frame = (atMs: number, v: number): SampledFrame => ({ atMs, sig: flat(v) });

describe("distance", () => {
  test("0 for the same picture, 1 for black against white, and tolerant of different lengths", () => {
    expect(distance(flat(40), flat(40))).toBe(0);
    expect(distance(flat(0), flat(255))).toBe(1);
    expect(distance([0, 0, 0, 0], [255, 255])).toBe(1);
    expect(distance([], [1])).toBe(0);
  });
});

describe("findCuts", () => {
  test("a steady clip has no cuts, even if it wobbles a little", () => {
    const wobble = [100, 104, 99, 103, 101, 105].map((v, i) => frame(i * 2000, v));
    expect(findCuts(wobble)).toEqual([]);
  });

  test("a big step is a cut and is placed between the two samples around it", () => {
    const frames = [frame(0, 30), frame(2000, 32), frame(4000, 31), frame(6000, 200), frame(8000, 202)];
    const cuts = findCuts(frames);
    expect(cuts).toHaveLength(1);
    expect(cuts[0]).toMatchObject({ afterMs: 4000, atMs: 6000 });
    expect(cuts[0].score).toBeGreaterThan(0.6);
  });

  test("a step under the floor is not a cut, and the clip's own jitter raises the bar", () => {
    expect(findCuts([frame(0, 100), frame(2000, 140)])).toEqual([]);
    // A shaky clip: every step is about 0.16, so a 0.22 step is not twice as big as usual.
    const shaky = [0, 40, 0, 40, 0, 56].map((v, i) => frame(i * 2000, v));
    expect(findCuts(shaky, { floor: 0.2 })).toEqual([]);
  });

  test("frames given out of order are sorted first", () => {
    const cuts = findCuts([frame(6000, 200), frame(0, 30), frame(4000, 31), frame(2000, 32)]);
    expect(cuts.map((c) => c.atMs)).toEqual([6000]);
  });

  test("fewer than two frames cannot cut", () => {
    expect(findCuts([])).toEqual([]);
    expect(findCuts([frame(0, 10)])).toEqual([]);
  });
});

describe("shotsOf", () => {
  const frames = [0, 2000, 4000, 6000, 8000, 10_000].map((t) => frame(t, 0));

  test("every sampled frame belongs to one shot and the last shot runs to the end of the clip", () => {
    const shots = shotsOf(frames, [{ afterMs: 4000, atMs: 6000, score: 0.7 }], 12_000);
    expect(shots).toEqual([
      { no: 1, startMs: 0, startAfterMs: 0, endMs: 6000, frames: 3, score: 0 },
      { no: 2, startMs: 6000, startAfterMs: 4000, endMs: 12_000, frames: 3, score: 0.7 },
    ]);
    expect(shots.reduce((n, s) => n + s.frames, 0)).toBe(frames.length);
  });

  test("no cuts is one shot, and no frames is no shots", () => {
    expect(shotsOf(frames, [], 12_000)).toHaveLength(1);
    expect(shotsOf([], [], 5000)).toEqual([]);
  });

  test("a duration shorter than the last frame never makes a shot end before it starts", () => {
    expect(shotsOf(frames, [], 1000)[0].endMs).toBe(10_000);
  });
});

describe("middleFrameMs and footageShare", () => {
  test("the frame nearest the middle of a shot, or null when the shot holds none", () => {
    const times = [0, 2000, 4000, 6000, 8000];
    expect(middleFrameMs({ startMs: 0, endMs: 6000 }, times)).toBe(2000);
    expect(middleFrameMs({ startMs: 4000, endMs: 10_000 }, times)).toBe(6000);
    expect(middleFrameMs({ startMs: 20_000, endMs: 30_000 }, times)).toBeNull();
  });

  test("share of the clip per kind comes from shot lengths, longest first", () => {
    const share = footageShare([
      { footage: "aerial", startMs: 0, endMs: 10_000 }, { footage: "podium", startMs: 10_000, endMs: 40_000 }, { footage: "aerial", startMs: 40_000, endMs: 50_000 },
    ]);
    expect(share.map((s) => s.footage)).toEqual(["podium", "aerial"]);
    expect(share[0].share).toBeCloseTo(0.6);
    expect(share[1].ms).toBe(20_000);
    expect(footageShare([])).toEqual([]);
    expect(footageShare([{ footage: "x", startMs: 5, endMs: 5 }])[0].share).toBe(0);
  });
});
