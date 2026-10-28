import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { laneProducts, sourceLanes, traces } from "@/db/schema";
import { planSetupLanes, suggestSetupProducts } from "@/lib/agents/orchestrator";
import { applySetupPlan } from "@/lib/setup";
import { analyzerFor, planProblems, type SetupPlan } from "@/lib/setup-rules";
import { withTrace } from "@/lib/trace";
import { reset, seedProject } from "../db";
import { modelCalls, scriptModel } from "../fakes";

const BODY = ["body-progress", "body-compare"];
const lane = (name: string, analyzer: "objects" | "body" | "screen", feeds: string[]) => ({ name, note: "", analyzer, feeds });

describe("setup rules", () => {
  test("each product needs the analyzer that writes what it reads", () => {
    expect(analyzerFor("body-progress")).toBe("body");
    expect(analyzerFor("friction-log")).toBe("screen");
    expect(analyzerFor("density-heatmap")).toBe("objects");
    expect(analyzerFor("people-count")).toBe("objects");
    expect(analyzerFor("nope")).toBeNull();
  });

  test("a good plan has no problems", () => {
    expect(planProblems({ lanes: [lane("Front photo", "body", BODY)] }, BODY)).toEqual([]);
  });

  test("wrong analyzers, unpicked products, unfed products and duplicate names are all caught", () => {
    const plan: SetupPlan = { lanes: [lane("Front", "objects", ["body-progress"]), lane("front", "body", ["friction-log"])] };
    const p = planProblems(plan, BODY);
    expect(p).toContain('Lane "Front" runs objects but "body-progress" needs a body lane.');
    expect(p).toContain('Lane "front" feeds "friction-log", which was not picked.');
    expect(p).toContain('No lane feeds "body-compare".');
    expect(p).toContain('Two lanes are called "front".');
  });
});

describe("AI setup", () => {
  beforeEach(reset);

  test("suggested products keep only real catalog ids, once each", async () => {
    scriptModel({ name: "My body", picks: [{ id: "body-progress", why: "Shows the trend." }, { id: "made-up", why: "x" }, { id: "body-progress", why: "again" }] });
    expect(await suggestSetupProducts("track my abs")).toEqual({ name: "My body", picks: [{ id: "body-progress", why: "Shows the trend." }] });
  });

  test("a plan that fails the check goes back to the model with the reason", async () => {
    scriptModel(
      { lanes: [{ name: "Front photo", note: "One photo a day", analyzer: "objects" }] },
      { links: [{ lane: "Front photo", product: "body-progress" }, { lane: "Front photo", product: "body-compare" }] },
      { lanes: [{ name: "Front photo", note: "One photo a day", analyzer: "body" }] },
      { links: [{ lane: "front photo", product: "body-progress" }, { lane: "Front photo", product: "body-compare" }] },
    );
    const r = await planSetupLanes("track my abs", BODY);
    expect(r).toMatchObject({ attempts: 2, problems: [], plan: { lanes: [{ name: "Front photo", analyzer: "body", feeds: BODY }] } });
    expect(JSON.stringify(modelCalls[2])).toContain("needs a body lane");
  });

  test("confirming the plan creates the lanes, their links, and moves the setup traces onto the project", async () => {
    const { project, user } = await seedProject();
    scriptModel({ name: "Body", picks: [{ id: "body-progress", why: "trend" }] });
    await withTrace({ userId: user.id }, () => suggestSetupProducts("abs"));
    const r = await applySetupPlan(project.id, user.id, { lanes: [lane("Front photo", "body", BODY)] }, BODY);
    expect(r).toMatchObject({ lanes: 1, links: 2, tracesClaimed: 1 });
    const [l] = await db.select().from(sourceLanes).where(eq(sourceLanes.projectId, project.id));
    expect(l.analyzer).toBe("body");
    expect((await db.select().from(laneProducts).where(eq(laneProducts.laneId, l.id))).map((x) => x.productId).sort()).toEqual([...BODY].sort());
    expect((await db.select().from(traces).where(eq(traces.projectId, project.id))).map((t) => t.name).sort()).toEqual(["setup.suggest_products"]);
    expect(await applySetupPlan(project.id, user.id, { lanes: [lane("Front", "objects", BODY)] }, BODY)).toMatchObject({ problems: [expect.stringContaining("needs a body lane"), expect.any(String)] });
  });
});
