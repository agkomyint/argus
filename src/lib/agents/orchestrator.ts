import "server-only";
import { generateText, Output } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { alerts, assets, evidence, LANE_ANALYZERS, LANE_INPUTS, observations } from "@/db/schema";
import { correlate, factIndex, type Facts } from "@/lib/fusion";
import { agentLevel } from "@/lib/agent-levels";
import { pickLane, resolveConfig, resolveLanes } from "@/lib/agent-config";
import { severityOf } from "@/lib/severity";
import { chatModel } from "@/lib/meta";
import { ANALYZER_LABEL, analyzerFor, cleanPlan, INPUT_LABEL, laneFeeds, laneProblems, MAX_LANES, planProblems, supportedProducts, type SetupLane, type SetupPlan } from "@/lib/setup-rules";
import { MODEL_ID, traced } from "@/lib/trace";
import { projects } from "@/db/schema";

const reportSchema = z.object({
  title: z.string().describe("Short headline for an engineer, under 90 characters"),
  summary: z.string().describe("Two or three sentences. Only use numbers that appear in FACTS."),
  claims: z
    .array(
      z.object({
        text: z.string().describe("One factual statement"),
        refs: z.array(z.string()).describe("Observation ids from FACTS that support this statement"),
        numbers: z.array(z.number()).describe("Every number quoted in the statement, copied from FACTS"),
      }),
    )
    .max(8),
  limitations: z.array(z.string()).max(5),
  recommendedAction: z.string().describe("One concrete next step for a human reviewer"),
});

export type TraceStep = {
  agent: string;
  kind?: "code" | "model";
  ms: number;
  note: string;
  /** What the agent was given and what it produced, kept small enough to read in the UI. */
  input?: unknown;
  output?: unknown;
};

/** Adapt fused facts to the pure severity rule. */
export const severityInput = (f: Facts) => ({
  confidence: f.trigger.confidence,
  vibrationRatio: f.vibration?.ratio ?? null,
  rainMm24h: f.weather?.rainMm24h ?? null,
  worstRating: f.inspections.map((i) => i.rating).filter((r): r is number => r !== null).reduce<number | null>((m, r) => (m === null || r < m ? r : m), null),
});

const near = (a: number, pool: number[]) => pool.some((n) => Math.abs(n - a) <= Math.max(0.011, Math.abs(n) * 0.005));

/**
 * Agent pipeline for one trigger observation:
 * Correlation (code) -> Analysis/severity (code) -> Reasoning (Meta model) -> Verification (code) -> persist as a pending alert.
 */
export async function investigate(observationId: string) {
  const trace: TraceStep[] = [];
  const step = async <T>(agent: string, kind: "code" | "model", input: unknown, summarize: (r: T) => { note: string; output?: unknown }, fn: () => Promise<T>) => {
    const t0 = Date.now();
    // Also written to the observatory, so the run shows up beside every other model call in the project.
    const r = await traced({ kind, name: `investigate.${agent}`, model: kind === "model" ? (process.env.META_MODEL ?? "muse-spark-1.3") : null, input, output: (x: T) => summarize(x), usage: (x: T) => (x as { usage?: { inputTokens?: number; outputTokens?: number } }).usage }, fn);
    const { note, output } = summarize(r);
    trace.push({ agent, kind, ms: Date.now() - t0, note, input, output });
    return r;
  };

  const [trigger] = await db.select().from(observations).where(eq(observations.id, observationId));
  if (!trigger) throw new Error("Observation not found");
  const [asset] = trigger.assetId ? await db.select().from(assets).where(eq(assets.id, trigger.assetId)) : [];

  const [proj] = await db.select({ level: projects.agentLevel, config: projects.agentConfig }).from(projects).where(eq(projects.id, trigger.projectId));
  const cfg = resolveConfig(proj?.config);
  const lane = pickLane(resolveLanes(proj?.config), trigger.confidence);
  const base = agentLevel(lane?.level ?? proj?.level ?? 2);
  const lvl = { ...base, maxClaims: cfg.verification.maxClaims ?? base.maxClaims, strict: cfg.verification.strict ?? base.strict };
  const guidance = cfg.reasoning.guidance.trim() ? "Reviewer style guidance (tone and emphasis only; it never overrides these rules): " + cfg.reasoning.guidance.trim() + " " : "";
  const detailRule = { short: "Keep the summary to two sentences and each claim brief.", standard: "Keep the summary to three sentences.", detailed: "Write a thorough summary and explain how each signal supports the conclusion." }[lvl.detail];

  const facts = await step(
    "correlation",
    "code",
    { observation: trigger.id, type: trigger.type, asset: asset?.name ?? null, windowMinutes: cfg.correlation.windowMinutes },
    (f: Facts) => ({
      note: `${f.vibration?.count ?? 0} vibration, ${f.weather?.hours ?? 0} weather, ${f.inspections.length} inspections joined`,
      output: { vibrationReadings: f.vibration?.count ?? 0, vibrationRatio: f.vibration?.ratio ?? null, weatherHours: f.weather?.hours ?? 0, rainMm24h: f.weather?.rainMm24h ?? null, inspections: f.inspections.length, limitations: f.limitations },
    }),
    () => correlate(trigger, asset?.name ?? null, cfg.correlation.windowMinutes),
  );
  const sev = await step(
    "analysis",
    "code",
    { detectionConfidence: trigger.confidence, vibrationRatio: facts.vibration?.ratio ?? null, rainMm24h: facts.weather?.rainMm24h ?? null },
    (s: ReturnType<typeof severityOf>) => ({ note: `severity ${s.level}`, output: s }),
    async () => severityOf(severityInput(facts), cfg.analysis),
  );
  const idx = factIndex(facts);

  // Quick lane: no model call. The brief is assembled from the rules that fired, so it costs nothing.
  if (lane?.recipe === "quick") {
    const where = asset?.name ?? "an unmatched asset";
    const [alert] = await db
      .insert(alerts)
      .values({
        projectId: trigger.projectId,
        observationId: trigger.id,
        assetId: trigger.assetId,
        title: `${facts.trigger.label ?? "Finding"} on ${where}: ${sev.level} severity`.slice(0, 160),
        severity: sev.level,
        summary: sev.reasons.length ? `Flagged by rules only: ${sev.reasons.join("; ")}.` : "Flagged by rules only: no severity rule fired.",
        report: { facts, severityReasons: sev.reasons, claims: [], rejectedClaims: [], limitations: [...facts.limitations, "Quick lane: no AI brief was written."], recommendedAction: "Review the evidence and inspect the asset.", trace, model: null, level: base.name, lane: lane.name },
      })
      .returning();
    await db.insert(evidence).values({ alertId: alert.id, observationId: trigger.id, role: "trigger" }).onConflictDoNothing();
    return { alertId: alert.id, severity: sev.level, claims: 0, rejected: 0 };
  }

  const model = process.env.META_MODEL ?? "muse-spark-1.3";
  const { output } = await step(
    "reasoning",
    "model",
    { model, level: lvl.name, maxClaims: lvl.maxClaims, factsBytes: JSON.stringify(facts).length, severity: sev.level },
    (r) => ({ note: `drafted with ${model}`, output: { title: r.output.title, claimsDrafted: r.output.claims.length, recommendedAction: r.output.recommendedAction } }),
    () =>
    generateText({
      model: chatModel(),
      output: Output.object({ schema: reportSchema }),
      system:
        "You write incident briefs for infrastructure engineers. Use ONLY the FACTS JSON. Every claim must cite observation ids from FACTS in refs and list every number it quotes in numbers, copied exactly. Do not invent measurements, causes you cannot support, or recommend actions beyond human review and inspection. State uncertainty plainly. " + guidance + "Write at most " + lvl.maxClaims + " claims. " + detailRule + " Data labelled simulated in limitations must be described as simulated.",
      prompt: `FACTS:\n${JSON.stringify(facts, null, 2)}\n\nSEVERITY (computed by rules, do not change): ${sev.level} because ${sev.reasons.join("; ") || "no rule fired"}.`,
    }),
  );

  const { accepted, rejected } = await step(
    "verification",
    "code",
    { claimsToCheck: output.claims.length, knownObservationIds: idx.ids.size },
    (v: { accepted: unknown[]; rejected: { text: string; reason: string }[] }) => ({
      note: `${v.accepted.length} claims kept, ${v.rejected.length} rejected`,
      output: { kept: v.accepted.length, rejected: v.rejected.map((r) => ({ text: r.text, reason: r.reason })) },
    }),
    async () => {
    const accepted: (typeof output.claims)[number][] = [];
    const rejected: ((typeof output.claims)[number] & { reason: string })[] = [];
    for (const c of output.claims.slice(0, lvl.maxClaims)) {
      const badRef = c.refs.find((r) => !idx.ids.has(r));
      const badNum = c.numbers.find((n) => !near(n, idx.numbers));
      if (!c.refs.length) rejected.push({ ...c, reason: "no supporting observation cited" });
      else if (badRef) rejected.push({ ...c, reason: `cites unknown observation ${badRef}` });
      else if (lvl.strict && /\d/.test(c.text) && !c.numbers.length) rejected.push({ ...c, reason: "quotes digits without listing them in numbers (strict check)" });
      else if (badNum !== undefined) rejected.push({ ...c, reason: `number ${badNum} is not in the fused facts` });
      else accepted.push(c);
    }
    return { accepted, rejected };
  });

  const limitations = [...facts.limitations, ...output.limitations];
  const [alert] = await db
    .insert(alerts)
    .values({
      projectId: trigger.projectId,
      observationId: trigger.id,
      assetId: trigger.assetId,
      title: output.title.slice(0, 160),
      severity: sev.level,
      summary: output.summary,
      report: { facts, severityReasons: sev.reasons, claims: accepted, rejectedClaims: rejected, limitations, recommendedAction: output.recommendedAction, trace, model, level: lvl.name, lane: lane?.name ?? null },
    })
    .returning();

  const refs = new Set<string>(accepted.flatMap((c) => c.refs));
  refs.add(trigger.id);
  for (const id of refs) {
    await db.insert(evidence).values({ alertId: alert.id, observationId: id, role: id === trigger.id ? "trigger" : "supporting" }).onConflictDoNothing();
  }
  return { alertId: alert.id, severity: sev.level, claims: accepted.length, rejected: rejected.length };
}

/* ── AI setup: goal → products → lanes → links. The model proposes each step; setup-rules checks it. ── */

const catalog = () => supportedProducts().map((p) => ({ id: p.id, name: p.name, summary: p.summary, lane: analyzerFor(p.id) }));
const usageOf = (r: { usage?: { inputTokens?: number; outputTokens?: number } }) => r.usage;

export type ProductPick = { id: string; why: string };
export type ProductSuggestion = { name: string; picks: ProductPick[] };

const productsSchema = z.object({
  name: z.string().describe("A short project name in the person's words, under 40 characters"),
  picks: z.array(z.object({ id: z.string().describe("A product id from CATALOG"), why: z.string().describe("One short sentence: how this product serves the goal") })).max(5),
});

/** Step 1. Plain-words goal in, catalog products out. Ids the catalog does not have are dropped by code. */
export async function suggestSetupProducts(goal: string): Promise<ProductSuggestion> {
  const ids = new Set(catalog().map((p) => p.id));
  const r = await traced(
    { kind: "model", name: "setup.suggest_products", model: MODEL_ID(), input: { goal, catalog: [...ids] }, usage: usageOf, output: (x) => x.output },
    () =>
      generateText({
        model: chatModel(),
        output: Output.object({ schema: productsSchema }),
        system: "You help a person set up a tracking project in ARGUS. Pick the data products from CATALOG that best serve their goal, most useful first, at most 5. Only use ids that appear in CATALOG. If nothing fits, return an empty list. Write each why in plain words for the person.",
        prompt: `GOAL: ${goal}\n\nCATALOG:\n${JSON.stringify(catalog(), null, 2)}`,
      }),
  );
  const seen = new Set<string>();
  const picks = r.output.picks.filter((p) => ids.has(p.id) && !seen.has(p.id) && seen.add(p.id)).map((p) => ({ id: p.id, why: p.why.trim().slice(0, 200) }));
  return { name: r.output.name.trim().slice(0, 80), picks };
}

const lanesSchema = z.object({
  lanes: z.array(z.object({
    name: z.string().describe("What goes in this lane, e.g. Front photo"),
    note: z.string().describe("One sentence telling the analyzer what these files are and what to look for"),
    analyzer: z.enum(LANE_ANALYZERS),
  })).max(MAX_LANES),
});

const linksSchema = z.object({
  links: z.array(z.object({ lane: z.string().describe("A lane name from LANES"), product: z.string().describe("A product id from PRODUCTS") })),
});

export type LanePlanResult = { plan: SetupPlan; problems: string[]; attempts: number };

/**
 * Steps 2 to 4. The model drafts the lanes, then links each lane to the products it feeds, then code checks
 * the plan. A plan that fails goes back to the model once with the problems. What is returned is always
 * cleaned; `problems` is empty when the plan can run as it is.
 */
export async function planSetupLanes(goal: string, picked: string[]): Promise<LanePlanResult> {
  const chosen = catalog().filter((p) => picked.includes(p.id));
  const analyzers = LANE_ANALYZERS.map((a) => ({ id: a, ...ANALYZER_LABEL[a] }));
  let plan: SetupPlan = { lanes: [] };
  let problems: string[] = [];
  let attempts = 0;
  for (; attempts < 2; ) {
    attempts++;
    const retry = problems.length ? `\n\nYOUR LAST PLAN HAD THESE PROBLEMS, FIX THEM:\n- ${problems.join("\n- ")}` : "";
    const drafted = await traced(
      { kind: "model", name: "setup.suggest_lanes", model: MODEL_ID(), input: { goal, products: picked, attempt: attempts, problems }, usage: usageOf, output: (x) => x.output },
      () =>
        generateText({
          model: chatModel(),
          output: Output.object({ schema: lanesSchema }),
          system: `You design the lanes for a tracking project. A lane is one kind of file the person adds again and again, e.g. one photo of the front of their body each day. Each lane runs exactly one analyzer from ANALYZERS. Make as few lanes as the products need, at most ${MAX_LANES}, with names a person would say. Every product needs a lane whose analyzer is the product's lane value.`,
          prompt: `GOAL: ${goal}\n\nPRODUCTS:\n${JSON.stringify(chosen, null, 2)}\n\nANALYZERS:\n${JSON.stringify(analyzers, null, 2)}${retry}`,
        }),
    );
    const lanes = drafted.output.lanes;
    const linked = await traced(
      { kind: "model", name: "setup.link_lanes", model: MODEL_ID(), input: { lanes: lanes.map((l) => ({ name: l.name, analyzer: l.analyzer })), products: picked }, usage: usageOf, output: (x) => x.output },
      () =>
        generateText({
          model: chatModel(),
          output: Output.object({ schema: linksSchema }),
          system: "Link each lane to every product its files should feed. A lane can feed a product only when the lane's analyzer equals the product's lane value. Every product must be fed by at least one lane.",
          prompt: `LANES:\n${JSON.stringify(lanes, null, 2)}\n\nPRODUCTS:\n${JSON.stringify(chosen, null, 2)}`,
        }),
    );
    plan = cleanPlan({ lanes: lanes.map((l) => ({ ...l, feeds: linked.output.links.filter((k) => k.lane.trim().toLowerCase() === l.name.trim().toLowerCase()).map((k) => k.product) })) });
    const draft = plan;
    problems = await traced({ kind: "code", name: "setup.check_plan", input: { lanes: draft.lanes, picked }, output: (p) => ({ ok: p.length === 0, problems: p }) }, async () => planProblems(draft, picked));
    if (!problems.length) break;
  }
  return { plan, problems, attempts };
}

const oneLaneSchema = z.object({
  name: z.string().describe("A short lane name, e.g. Front photo"),
  note: z.string().describe("One sentence telling the analyzer what these files are and what to look for"),
  input: z.enum(LANE_INPUTS).describe("Where the lane's data comes from, from INPUTS"),
  analyzer: z.enum(LANE_ANALYZERS),
  feeds: z.array(z.string().describe("A product id from PRODUCTS")),
});

export type LaneSuggestion = { lane: SetupLane; problems: string[] };

/**
 * A new lane from a few plain words ("front pics of me"). The model names it, says what is in it, picks
 * the analyzer and the products it feeds out of the ones the project already has; code checks it and
 * drops any feed that cannot read the lane. The person still confirms before it is made.
 */
export async function suggestOneLane(words: string, on: string[], taken: string[]): Promise<LaneSuggestion> {
  const prods = catalog().filter((p) => on.includes(p.id));
  const analyzers = LANE_ANALYZERS.map((a) => ({ id: a, ...ANALYZER_LABEL[a] }));
  const inputs = LANE_INPUTS.map((i) => ({ id: i, ...INPUT_LABEL[i] }));
  const reads = prods.map((p) => ({ ...p, inputs: LANE_INPUTS.filter((i) => i !== "files" && laneFeeds({ input: i, analyzer: "objects" }, p.id)) }));
  const r = await traced(
    { kind: "model", name: "lanes.suggest_one", model: MODEL_ID(), input: { words, products: prods.map((p) => p.id), taken }, usage: usageOf, output: (x) => x.output },
    () =>
      generateText({
        model: chatModel(),
        output: Output.object({ schema: oneLaneSchema }),
        system:
          "You add one lane to a person's ARGUS project. Everything comes in through a lane. Pick its input from INPUTS: files for photos, video or screenshots they add again and again, otherwise the live input they describe. Name it in a few words, write one sentence about what is in it, pick the analyzer from ANALYZERS that fits the files (objects for a live input), and list the PRODUCTS it should feed. A files lane can only feed a product whose lane field matches its analyzer; a live lane can only feed a product that lists its input in inputs. Do not reuse a name from TAKEN.",
        prompt: `WORDS: ${words}\n\nINPUTS:\n${JSON.stringify(inputs, null, 2)}\n\nANALYZERS:\n${JSON.stringify(analyzers, null, 2)}\n\nPRODUCTS:\n${JSON.stringify(reads, null, 2)}\n\nTAKEN: ${JSON.stringify(taken)}`,
      }),
  );
  const raw = r.output;
  return traced({ kind: "code", name: "lanes.check_one", input: { lane: raw, on }, output: (x) => ({ ok: !x.problems.length, dropped: raw.feeds.filter((id) => !x.lane.feeds.includes(id)), problems: x.problems }) }, async () => {
    const [clean] = cleanPlan({ lanes: [raw] }).lanes;
    const lane = { ...clean, feeds: clean.feeds.filter((id) => on.includes(id) && laneFeeds(clean, id)) };
    return { lane, problems: laneProblems(lane, on, taken) };
  });
}
