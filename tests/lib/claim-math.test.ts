import { describe, expect, test } from "bun:test";
import { checkClaims, tally, type Proposal } from "@/lib/claim-math";

const turns = new Map([["T1", "The truck driver was on drugs and hit three cars."], ["T2", "Police arrived within minutes."]]);
const evidence = new Set(["E1", "E2"]);
const p = (o: Partial<Proposal>): Proposal => ({ turn: "T1", claim: "hit three cars", quote: "hit three cars", verdict: "supported", evidence: ["E1"], reason: "r", ...o });

describe("checkClaims", () => {
  test("a supported claim that cites real evidence is shown, a contradicted one is contradicted", () => {
    const { kept } = checkClaims([p({}), p({ turn: "T2", claim: "minutes", quote: "Within Minutes", verdict: "contradicted", evidence: ["E2"] })], turns, evidence);
    expect(kept.map((k) => k.status)).toEqual(["shown", "contradicted"]);
  });
  test("a verdict citing no real evidence is not shown, and says it was downgraded", () => {
    const { kept } = checkClaims([p({ evidence: ["E9"] }), p({ claim: "on drugs", quote: "on drugs", verdict: "unverifiable", evidence: [] })], turns, evidence);
    expect(kept.map((k) => [k.status, k.downgraded])).toEqual([["not shown", true], ["not shown", false]]);
    expect(kept[0].evidence).toEqual([]);
  });
  test("drops unknown turns, made-up quotes and repeats", () => {
    const { kept, dropped } = checkClaims([p({ turn: "T9" }), p({ quote: "never said this" }), p({}), p({})], turns, evidence);
    expect(kept).toHaveLength(1);
    expect(dropped.map((d) => d.why)).toEqual(["no such turn", "quote is not in the turn", "repeat"]);
  });
  test("tally counts each status", () => {
    expect(tally([{ status: "shown" }, { status: "shown" }, { status: "not shown" }])).toEqual({ shown: 2, contradicted: 0, "not shown": 1 });
  });
});
