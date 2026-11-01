import { describe, expect, test } from "bun:test";
import { fit, MIN_VIEW, panBy, rulerTicks, tickStep, zoomAround } from "@/lib/timeline-zoom";

const M = 60_000;
describe("timeline zoom", () => {
  test("zooming in keeps the point under the cursor where it was", () => {
    const v = zoomAround({ from: 0, to: 60 * M }, 0, 60 * M, 0.5, 15 * M)!;
    expect(v.to - v.from).toBe(30 * M);
    expect((15 * M - v.from) / (v.to - v.from)).toBeCloseTo(0.25, 5);
  });
  test("zooming out to everything returns null, and never past the ends", () => {
    expect(zoomAround({ from: 10 * M, to: 20 * M }, 0, 60 * M, 10, 15 * M)).toBeNull();
    const v = zoomAround({ from: 0, to: 10 * M }, 0, 60 * M, 2, 0)!;
    expect(v.from).toBe(0);
  });
  test("cannot zoom tighter than the minimum", () => {
    const v = zoomAround({ from: 0, to: 20_000 }, 0, 60 * M, 0.01, 10_000)!;
    expect(v.to - v.from).toBe(MIN_VIEW);
  });
  test("panning stops at the ends", () => {
    expect(panBy({ from: 10 * M, to: 20 * M }, 0, 60 * M, -50 * M)).toEqual({ from: 0, to: 10 * M });
    expect(panBy({ from: 10 * M, to: 20 * M }, 0, 60 * M, 99 * M)).toEqual({ from: 50 * M, to: 60 * M });
    expect(fit({ from: -5, to: 5 }, 0, 100).from).toBe(0);
  });
  test("ticks use a round step and skip quiet gaps", () => {
    expect(tickStep(60 * M)).toBe(10 * M);
    expect(tickStep(20_000)).toBe(5000);
    const ticks = rulerTicks({ from: 0, to: 60 * M }, [{ from: 15 * M, to: 35 * M }]);
    expect(ticks.map((t) => t.t / M)).toEqual([0, 10, 40, 50, 60]);
  });
});
