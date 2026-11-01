import { describe, expect, test } from "bun:test";
import { alertsOf, crossed, frameMs, runApp, signalType, SIGNALS, toNotify, type AppConfig, type AppData } from "@/lib/app-run";

const MIN = 60_000;
const row = (id: string, arrived: number, payload: Record<string, unknown>, type = "people_count") => ({ id, type, t: arrived, arrived, payload });
const people = (rows: ReturnType<typeof row>[]): AppData => ({ id: "people-count", name: "People count", data: [{ type: "people_count", total: rows.length, latest: null, rows }] });
const app = (over: Partial<AppConfig> = {}, rule: Partial<AppConfig["rule"]> = {}): AppConfig => ({
  id: "a1", name: "Store watch", kind: "watcher", reads: ["people-count"], on: true, onTimeline: true,
  rule: { dials: { "people-count": 3 }, severity: "high", cooldownMin: 5, browserAlert: false, ...rule }, ...over,
});

describe("runApp", () => {
  test("fires when a count passes the dial, with the reason", () => {
    const out = runApp(app(), [people([row("r1", 0, { count: 2 }), row("r2", MIN, { count: 5 })])]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "a1:r2", rowId: "r2", at: MIN, severity: "high", label: "5 people", why: "5 people in one frame, more than 3", productName: "People count" });
  });

  test("equal to the dial does not fire", () => {
    expect(runApp(app(), [people([row("r1", 0, { count: 3 })])])).toEqual([]);
  });

  test("stays quiet for the cooldown, then fires again, whatever order the rows arrive in", () => {
    const rows = [row("r3", 6 * MIN, { count: 9 }), row("r1", 0, { count: 4 }), row("r2", 2 * MIN, { count: 8 })];
    expect(runApp(app(), [people(rows)]).map((a) => a.id)).toEqual(["a1:r1", "a1:r3"]);
    expect(runApp(app({}, { cooldownMin: 0 }), [people(rows)])).toHaveLength(3);
  });

  test("an app that is off, or not a watcher, raises nothing", () => {
    const data = [people([row("r1", 0, { count: 9 })])];
    expect(runApp(app({ on: false }), data)).toEqual([]);
    expect(runApp(app({ kind: "digest" }), data)).toEqual([]);
  });

  test("a product that is missing, or has no rule, is skipped", () => {
    const speech: AppData = { id: "speech-log", name: "Speech log", data: [{ type: "transcript_turn", total: 1, latest: null, rows: [row("x", 0, {}, "transcript_turn")] }] };
    expect(runApp(app({ reads: ["gone", "speech-log"] }), [speech])).toEqual([]);
  });

  test("uses the product's own default when the dial was never set", () => {
    const out = runApp(app({}, { dials: {} }), [people([row("r1", 0, { count: 4 })])]);
    expect(out).toHaveLength(1);
  });

  test("a shelf carry-out held long enough fires; one put back does not", () => {
    const shelf: AppData = { id: "shelf-interactions", name: "Shelf interactions", data: [{ type: "shelf_event", total: 3, latest: null, rows: [
      row("e1", 0, { held_ms: 34_000, outcome: "carried_out" }, "shelf_event"),
      row("e2", 10 * MIN, { held_ms: 40_000, outcome: "returned" }, "shelf_event"),
      row("e3", 20 * MIN, { held_ms: 5_000, outcome: "carried_out" }, "shelf_event"),
    ] }] };
    const out = runApp(app({ reads: ["shelf-interactions"], rule: { dials: { "shelf-interactions": 20 }, severity: "high", cooldownMin: 0, browserAlert: false } }), [shelf]);
    expect(out.map((a) => [a.id, a.label])).toEqual([["a1:e1", "Held 34 s, left"]]);
  });

  test("a non-number reads as zero", () => {
    expect(SIGNALS.people_count.hit({ count: "many" }, 0)).toBeNull();
  });
});

describe("alerts across apps", () => {
  test("alertsOf joins every app, oldest first", () => {
    const data = [people([row("r1", MIN, { count: 9 }), row("r2", 0, { count: 9 })])];
    const out = alertsOf([app({ id: "a1" }, { cooldownMin: 0 }), app({ id: "a2", name: "Second" }, { cooldownMin: 0 })], data);
    expect(out.map((a) => a.at)).toEqual([0, 0, MIN, MIN]);
  });

  test("crossed gives the alerts passed between two moments", () => {
    const out = alertsOf([app({}, { cooldownMin: 0 })], [people([row("r1", MIN, { count: 9 }), row("r2", 2 * MIN, { count: 9 }), row("r3", 3 * MIN, { count: 9 })])]);
    expect(crossed(out, MIN, 3 * MIN).map((a) => a.at)).toEqual([2 * MIN, 3 * MIN]);
    expect(crossed(out, 3 * MIN, 9 * MIN)).toEqual([]);
  });

  test("signalType finds the first watchable type", () => {
    expect(signalType(["object_track", "people_count"])).toBe("people_count");
    expect(signalType(["object_track"])).toBeNull();
  });
});

test("a frame row says where in the video it was", () => {
  expect(frameMs({ at_ms: 12_000 })).toBe(12_000);
  expect(frameMs({ at_ms: "x" })).toBeNull();
  expect(frameMs({})).toBeNull();
  const [a] = runApp(app(), [people([row("r1", 0, { count: 9, at_ms: 5000 })])]);
  expect(a.frameMs).toBe(5000);
});

describe("toNotify", () => {
  const apps = [app({ id: "loud" }, { cooldownMin: 0, browserAlert: true }), app({ id: "quiet" }, { cooldownMin: 0 })];
  const alerts = alertsOf(apps, [people([row("r1", MIN, { count: 9 }), row("r2", 2 * MIN, { count: 9 })])]);

  test("only apps that asked for a browser alert, and only what the playhead passed", () => {
    expect(toNotify(alerts, apps, 0, MIN, new Set()).map((a) => a.id)).toEqual(["loud:r1"]);
    expect(toNotify(alerts, apps, 0, 5 * MIN, new Set()).map((a) => a.id)).toEqual(["loud:r1", "loud:r2"]);
  });

  test("never the same alert twice", () => {
    expect(toNotify(alerts, apps, 0, 5 * MIN, new Set(["loud:r1"])).map((a) => a.id)).toEqual(["loud:r2"]);
  });
});
