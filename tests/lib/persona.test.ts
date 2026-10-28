import { describe, expect, test } from "bun:test";
import { agreementOf, GRID, heatOf, similarity } from "@/lib/persona-math";
import { getProduct } from "@/products";
import { getWidget } from "@/widgets/registry";

describe("persona maths", () => {
  test("heat sums to one and stays on the grid for points off the edge", () => {
    const h = heatOf([{ x: -2, y: 0.5 }, { x: 3, y: 9 }]);
    expect(h).toHaveLength(GRID * GRID);
    expect(h.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  test("same points agree fully, opposite corners barely", () => {
    const a = heatOf([{ x: 0.1, y: 0.1 }]);
    expect(similarity(a, a)).toBeCloseTo(1, 6);
    expect(similarity(a, heatOf([{ x: 0.9, y: 0.9 }]))).toBeLessThan(0.05);
  });

  test("agreement names the most split pair and needs two personas", () => {
    const top = [{ x: 0.5, y: 0.1 }];
    const r = agreementOf([
      { persona: "a", points: top },
      { persona: "b", points: top },
      { persona: "c", points: [{ x: 0.5, y: 0.95 }] },
    ]);
    expect(r.pairs).toHaveLength(3);
    expect(r.split?.b).toBe("c");
    expect(r.agreement).toBeGreaterThan(30);
    expect(r.agreement).toBeLessThan(40);
    expect(agreementOf([{ persona: "a", points: top }]).agreement).toBeNull();
  });
});

test("persona products are registered with their widgets", () => {
  for (const id of ["persona-perception-map", "persona-agreement", "friction-log"]) {
    const p = getProduct(id);
    expect(p?.status).toBe("supported");
    expect(getWidget(p!.widget!.id)).toBeDefined();
  }
});
