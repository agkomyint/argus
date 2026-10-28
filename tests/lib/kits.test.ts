import { describe, expect, test } from "bun:test";
import { clearChange, dayOf } from "@/lib/body-math";
import { personaName } from "@/lib/personas";
import { enabledProducts, typeCounts } from "@/lib/project-reads";
import { liveReady } from "@/lib/setup-rules";
import { moment, rowKeys } from "@/widgets/kit";
import { checkins, deltaOf, deltaTone, lanesOf, regionsIn, scoreOf, shortDay, signed, sinceDay1 } from "@/widgets/library/body-kit";
import { personaColor, personaLabel, pointsOf, screenKey, screenName, severityOf } from "@/widgets/library/persona-kit";
import type { FlatRow } from "@/widgets/schema";
import { db } from "@/db";
import { observations, projectProducts } from "@/db/schema";
import { reset, seedProject } from "../db";

const row = (t: number, o: Record<string, unknown>) => ({ t, ...o }) as FlatRow;

describe("body widget helpers", () => {
  test("scores, changes and words", () => {
    expect(scoreOf(row(0, { abs: 4 }), "abs")).toBe(4);
    expect(scoreOf(row(0, { abs: 0 }), "abs")).toBeNull();
    expect(scoreOf(row(0, { abs: null }), "abs")).toBeNull();
    expect(scoreOf(undefined, "abs")).toBeNull();
    expect(deltaOf({ abs: 2 }, "abs")).toBe(2);
    expect(deltaOf({ abs: null }, "abs")).toBeNull();
    expect(deltaOf("x", "abs")).toBeNull();
    expect([signed(null), signed(2), signed(0), signed(-1)]).toEqual(["–", "+2", "±0", "-1"]);
    expect([deltaTone(1), deltaTone(3), deltaTone(-3)]).toEqual(["text-muted-foreground", "text-signal", "text-destructive"]);
    expect([sinceDay1(null), sinceDay1(3), sinceDay1(1)]).toEqual(["no change measured yet", "+3 since day 1", "about the same as day 1 (+1)"]);
    expect(clearChange(2)).toBe(true);
    expect(dayOf(new Date("2026-05-01T23:00:00Z"))).toBe("2026-05-01");
  });

  test("check-ins keep the last photo per lane and day; lanes sort by days", () => {
    const rows = [
      row(2, { day: "2026-05-02", lane_id: "a", lane: "Front", abs: 4 }),
      row(1, { day: "2026-05-01", lane_id: "a", lane: "Front", abs: 3 }),
      row(3, { day: "2026-05-01", lane_id: "a", lane: "Front", abs: 5 }),
      row(4, { day: "2026-05-01", lane_id: "b", lane: "Side" }),
      row(5, { lane_id: "a" }),
    ];
    expect(checkins(rows).map((r) => [r.day, r.lane_id, r.abs])).toEqual([["2026-05-01", "a", 5], ["2026-05-01", "b", undefined], ["2026-05-02", "a", 4]]);
    expect(lanesOf(rows.slice(0, 4))).toEqual([{ id: "a", name: "Front", days: 3 }, { id: "b", name: "Side", days: 1 }]);
    expect(lanesOf([row(0, {})])).toEqual([{ id: "", name: "Photos", days: 1 }]);
    expect(regionsIn(rows)).toEqual(["abs"]);
    expect(shortDay("2026-05-01")).toBe("May 1");
    expect(shortDay(3)).toBe("");
  });
});

describe("persona widget helpers", () => {
  test("names, colours, keys and points", () => {
    expect(personaName("newcomer")).toBe("First-time visitor");
    expect(personaName("who")).toBe("who");
    expect(personaColor("newcomer")).toBe("var(--electric)");
    expect(personaColor("who")).toBe("var(--electric)");
    expect(personaLabel(row(0, { persona_name: "Skeptic" }))).toBe("Skeptic");
    expect(personaLabel(row(0, { persona: "hurried" }))).toBe("In a hurry");
    expect(personaLabel(row(0, {}))).toBe("");
    expect([screenKey(row(0, { upload_id: "u" })), screenKey(row(0, { file: "f" })), screenKey(row(0, {}))]).toEqual(["u", "f", ""]);
    expect([screenName(row(0, { page: "Home" })), screenName(row(0, {}))]).toEqual(["Home", "Screen"]);
    expect([severityOf(row(0, { severity: "high" })), severityOf(row(0, { severity: "huge" }))]).toEqual(["high", "low"]);
    expect(pointsOf([{ x: 1, y: 2 }, { x: "a", y: 1 }, null])).toEqual([{ x: 1, y: 2 }]);
    expect(pointsOf("no")).toEqual([]);
  });

  test("a row's moment is its clip second, else its clock time", () => {
    expect(moment(row(0, { at: "00:12" }))).toBe("00:12");
    expect(moment(row(Date.UTC(2026, 0, 1, 9, 30), {}))).toBe("09:30");
  });
});

describe("small server reads", () => {
  test("a live source is ready once it has what it needs", () => {
    expect(liveReady({ kind: "weather", config: {} })).toBe(false);
    expect(liveReady({ kind: "weather", config: { lat: 1 } })).toBe(true);
    expect(liveReady({ kind: "sensor_sim", config: null })).toBe(false);
    expect(liveReady({ kind: "sensor_sim", config: { asset: "B1" } })).toBe(true);
    expect(liveReady({ kind: "screen", config: {} })).toBe(true);
  });

  test("enabled products skip unknown ids; type counts group by type", async () => {
    await reset();
    const { project } = await seedProject();
    await db.insert(projectProducts).values([{ projectId: project.id, productId: "people-count" }, { projectId: project.id, productId: "nope" }]);
    await db.insert(observations).values([{ projectId: project.id, type: "people_count", eventTime: new Date() }, { projectId: project.id, type: "people_count", eventTime: new Date() }]);
    expect((await enabledProducts(project.id)).map((p) => p.id)).toEqual(["people-count"]);
    expect(await typeCounts(project.id)).toEqual([{ type: "people_count", n: 2 }]);
  });
});

describe("rowKeys", () => {
  test("keeps each row's key as rows arrive, and tells look-alike rows apart", () => {
    const a = { t: 1, type: "x", label: "truck" } as FlatRow;
    const b = { t: 2, type: "x", label: "person" } as FlatRow;
    const first = rowKeys([b, a]);
    const later = rowKeys([{ t: 3, type: "x" } as FlatRow, b, a]);
    expect(later.slice(1)).toEqual(first);
    expect(rowKeys([a, a], (r) => [r.label])).toEqual(["1|x|truck", "1|x|truck#1"]);
  });
});
