import { describe, expect, test } from "bun:test";
import { CONTRACTS, contractProblems, productFit, timelineProblem, type ProductFacts } from "@/lib/app-contract";

const alert: ProductFacts = { id: "a", name: "Shelf interactions", kind: "event-stream", observationTypes: ["shelf_event"] };
const series: ProductFacts = { id: "b", name: "People count", kind: "timeseries", observationTypes: ["people_count"] };
const dataset: ProductFacts = { id: "c", name: "Object tracks", kind: "dataset", observationTypes: ["object_track"] };
const api: ProductFacts = { id: "d", name: "Intelligence API", kind: "api", observationTypes: [] };

describe("app contract", () => {
  test("a product fits when its kind is accepted", () => {
    expect(productFit("watcher", alert)).toBeNull();
    expect(productFit("digest", dataset)).toBeNull();
  });

  test("a product that does not fit says why", () => {
    expect(productFit("watcher", dataset)).toBe("A watcher reads event-stream, timeseries. Object tracks is a dataset.");
  });

  test("a good combination has no problems", () => {
    expect(contractProblems("watcher", [alert, series])).toEqual([]);
  });

  test("too few, too many and unfit products are all reported", () => {
    expect(contractProblems("tracker", [])).toEqual(["Pick at least 1 data product for this app to read."]);
    expect(contractProblems("tracker", [series, alert, series])).toEqual(["A tracker reads at most 2 products. Switch one off."]);
    expect(contractProblems("watcher", [alert, dataset])).toHaveLength(1);
  });

  test("every kind of app reads at least one product kind", () => {
    for (const c of Object.values(CONTRACTS)) expect(c.accepts.length).toBeGreaterThan(0);
  });

  test("the timeline needs a product that writes Observations", () => {
    expect(timelineProblem([])).toContain("Pick a data product");
    expect(timelineProblem([api])).toContain("nothing to place");
    expect(timelineProblem([api, series])).toBeNull();
  });
});

describe("watcher rules", () => {
  test("a watcher needs a product whose Observations have an alert rule", () => {
    const speech: ProductFacts = { id: "s", name: "Speech log", kind: "event-stream", observationTypes: ["transcript_turn"] };
    expect(productFit("watcher", speech)).toBe("Speech log has no alert rule yet.");
    expect(productFit("digest", speech)).toBeNull();
  });
});
