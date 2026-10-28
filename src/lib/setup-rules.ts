import { LANE_ANALYZERS, LANE_INPUTS, type LaneAnalyzer, type LaneInput } from "@/lib/lane-kinds";
import { sourcesFor, type SourceKind } from "@/lib/product-sources";
import { products } from "@/products";

/**
 * The rules behind AI setup. The model proposes products, lanes and which lane feeds which product;
 * this code decides whether that plan can actually run. DB-free so the dialog and tests can use it.
 */

/** What each analyzer writes. A lane can only feed a product that reads one of these. */
export const WRITES: Record<LaneAnalyzer, string[]> = {
  objects: ["object_detected", "object_track", "object_mask", "people_count", "attribute_breakdown"],
  body: ["body_progress", "body_view"],
  screen: ["persona_view", "persona_friction", "persona_agreement"],
};

export const ANALYZER_LABEL: Record<LaneAnalyzer, { name: string; files: string; does: string }> = {
  objects: { name: "Find objects", files: "Photos or video", does: "finds and counts what is in each photo or frame" },
  body: { name: "Body check-in", files: "One photo a day", does: "scores visible areas and compares each day with day 1" },
  screen: { name: "Persona panel", files: "Website screenshots", does: "five personas each read the page and say where they get stuck" },
};

export const supportedProducts = () => products.filter((p) => p.status === "supported");

/** The analyzer a product needs its lane to run. A product built on another product needs that one's. */
export function analyzerFor(productId: string, seen = new Set<string>()): LaneAnalyzer | null {
  const p = products.find((x) => x.id === productId);
  if (!p || seen.has(productId)) return null;
  seen.add(productId);
  return LANE_ANALYZERS.find((a) => p.observationTypes.some((t) => WRITES[a].includes(t))) ?? p.inputs.map((id) => analyzerFor(id, seen)).find(Boolean) ?? null;
}

export const canFeed = (analyzer: LaneAnalyzer, productId: string) => analyzerFor(productId) === analyzer;

/** What comes into a lane. Files are read by the lane's analyzer; a live input brings its own rows. */
export const INPUT_LABEL: Record<LaneInput, { name: string; blurb: string }> = {
  files: { name: "Files", blurb: "Photos, video or screenshots you drop in" },
  screen: { name: "Screen share", blurb: "A live screen or camera view, sampled in your browser" },
  weather: { name: "Weather feed", blurb: "Open-Meteo readings for one place" },
  sensor_sim: { name: "Sensor", blurb: "A simulated vibration sensor on one asset" },
  webhook: { name: "Webhook", blurb: "JSON events pushed from your own system" },
};
const LIVE_KIND: Partial<Record<LaneInput, SourceKind>> = { screen: "screen", weather: "weather", sensor_sim: "sensor" };

/** Whether a lane can feed a product: file lanes by their analyzer, live lanes by the kind of input the product reads. */
export function laneFeeds(lane: { input?: LaneInput; analyzer: LaneAnalyzer }, productId: string) {
  const input = lane.input ?? "files";
  if (input === "files") return canFeed(lane.analyzer, productId);
  const kind = LIVE_KIND[input];
  return !!kind && sourcesFor(productId).some((n) => n.kind === kind);
}

/** Whether a live lane's source has what it needs to start. A screen or webhook needs nothing stored. */
export function liveReady(s: { kind: string; config: unknown }) {
  const cfg = (s.config ?? {}) as { lat?: number; asset?: string };
  return s.kind === "weather" ? cfg.lat !== undefined : s.kind === "sensor_sim" ? !!cfg.asset : true;
}

export type SetupLane = { name: string; note: string; analyzer: LaneAnalyzer; feeds: string[]; input?: LaneInput };
export type SetupPlan = { lanes: SetupLane[] };

export const MAX_LANES = 6;

/**
 * Check a plan against the products the person picked. Returns plain-English problems, empty when the
 * plan is good. The same check runs on the model's draft (and goes back to it on a retry) and on the
 * server before anything is created.
 */
export function planProblems(plan: SetupPlan, picked: string[]): string[] {
  const out: string[] = [];
  if (!plan.lanes.length) out.push("There are no lanes.");
  if (plan.lanes.length > MAX_LANES) out.push(`Use at most ${MAX_LANES} lanes.`);
  const names = new Set<string>();
  for (const l of plan.lanes) {
    const label = l.name.trim() || "(unnamed)";
    if (!l.name.trim()) out.push("A lane has no name.");
    if (names.has(label.toLowerCase())) out.push(`Two lanes are called "${label}".`);
    names.add(label.toLowerCase());
    if (!(LANE_ANALYZERS as readonly string[]).includes(l.analyzer)) out.push(`Lane "${label}" uses analyzer "${l.analyzer}", which does not exist. Use one of ${LANE_ANALYZERS.join(", ")}.`);
    if (!l.feeds.length) out.push(`Lane "${label}" feeds no product.`);
    for (const id of l.feeds) {
      if (!picked.includes(id)) out.push(`Lane "${label}" feeds "${id}", which was not picked.`);
      else if (!canFeed(l.analyzer, id)) out.push(`Lane "${label}" runs ${l.analyzer} but "${id}" needs a ${analyzerFor(id) ?? "different"} lane.`);
    }
  }
  for (const id of picked) if (!plan.lanes.some((l) => l.feeds.includes(id))) out.push(`No lane feeds "${id}".`);
  return [...new Set(out)];
}

/** Keep only what the person can see and edit: trimmed text, known products, no duplicate links. */
export function cleanPlan(plan: SetupPlan): SetupPlan {
  return {
    lanes: plan.lanes.slice(0, MAX_LANES).map((l) => ({
      name: l.name.trim().slice(0, 60),
      note: l.note.trim().slice(0, 300),
      analyzer: l.analyzer,
      ...(l.input && l.input !== "files" ? { input: l.input } : {}),
      feeds: [...new Set(l.feeds)].filter((id) => products.some((p) => p.id === id)),
    })),
  };
}

/**
 * Check one new lane for a project that already runs. Unlike a full plan, feeding nothing is allowed (the
 * lane can wait for a product), but a feed must be on in the project and able to read the lane.
 */
export function laneProblems(lane: SetupLane, on: string[], taken: string[]): string[] {
  const out: string[] = [];
  const label = lane.name.trim() || "(unnamed)";
  if (!lane.name.trim()) out.push("The lane has no name.");
  if (taken.some((n) => n.trim().toLowerCase() === label.toLowerCase())) out.push(`There is already a lane called "${label}".`);
  const input = lane.input ?? "files";
  if (!(LANE_INPUTS as readonly string[]).includes(input)) out.push(`Input "${input}" does not exist. Use one of ${LANE_INPUTS.join(", ")}.`);
  else if (!(LANE_ANALYZERS as readonly string[]).includes(lane.analyzer)) out.push(`Analyzer "${lane.analyzer}" does not exist. Use one of ${LANE_ANALYZERS.join(", ")}.`);
  for (const id of lane.feeds) {
    if (!on.includes(id)) out.push(`"${id}" is not a product in this project.`);
    else if (laneFeeds(lane, id)) continue;
    else if (input === "files") out.push(`"${id}" needs a ${analyzerFor(id) ?? "different"} lane, not ${lane.analyzer}.`);
    else out.push(`"${id}" cannot read a ${INPUT_LABEL[input].name.toLowerCase()} lane.`);
  }
  return out;
}
