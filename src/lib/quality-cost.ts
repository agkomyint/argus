import { AGENT_LEVELS } from "@/lib/agent-levels";
import { MODELS, type Capability } from "@/lib/models";
import type { LaneAnalyzer } from "@/lib/lane-kinds";

/**
 * Quality and cost settings, DB-free so the panel can show the bill as the dials move. A project picks a
 * preset; each lane then holds one setting per model it calls, and the lane's sampling. All prices are
 * planning estimates until the traces measure real spend. Nothing here is stored or enforced yet.
 */

/** The models a lane can call, in the order they run. The model id shown is read from MODELS. */
export const LANE_MODELS: readonly Capability[] = ["reason", "segment", "transcribe"];

export const modelOf = (c: Capability) => MODELS.find((m) => m.capability === c)!;

export type ModelSetting = {
  on: boolean;
  /** How much the model writes or checks. Maps onto the agent levels (0 Lean … 4 Maximum). */
  level: number;
};

/** How SAM reads a lane's video: a picture per sampled frame, or the whole clip followed by SAM itself. */
export type SamMode = "images" | "video";

/** Share of sampled frames that look like the last one and are not sent to the models again. */
export const SKIP_CHOICES = [0, 0.2, 0.5] as const;

export type LaneQuality = {
  mode: SamMode;
  /** Frames left out because they barely changed. Spark and SAM reuse the last frame's answer. Planning share, not measured. */
  skip: (typeof SKIP_CHOICES)[number];
  /** Seconds between sampled frames of a video or live source. */
  every: number;
  /** The most frames one video may use. Anything longer is sampled more thinly, not cut off. */
  maxFrames: number;
  /** Longest side of a frame sent to the models, in pixels. */
  side: number;
  models: Record<Capability, ModelSetting>;
};

export const EVERY_CHOICES = [2, 5, 10, 30, 60] as const;
export const SIDE_CHOICES = [512, 768, 1024, 1536] as const;
export const FRAME_CAPS = [20, 60, 120, 300] as const;

export const PRESETS = [
  { name: "Lean", level: 0, every: 30, maxFrames: 20, side: 512, summary: "Fewest frames, smallest pictures, short reads" },
  { name: "Balanced", level: 2, every: 10, maxFrames: 60, side: 768, summary: "A frame every 10 s, standard reads" },
  { name: "Careful", level: 3, every: 5, maxFrames: 120, side: 1024, summary: "Closer sampling, strict claim check" },
  { name: "Maximum", level: 4, every: 2, maxFrames: 300, side: 1536, summary: "Dense sampling, full size, every finding" },
] as const;
export type Preset = (typeof PRESETS)[number];

/** What each analyzer calls by default. A lane never calls a model its analyzer has no use for. */
export const USES: Record<LaneAnalyzer, Capability[]> = {
  objects: ["reason", "segment"],
  body: ["reason", "segment"],
  screen: ["reason"],
  speech: ["transcribe"],
};

export function laneQuality(analyzer: LaneAnalyzer, preset: Preset): LaneQuality {
  const uses = USES[analyzer];
  const models = Object.fromEntries(LANE_MODELS.map((c) => [c, { on: uses.includes(c), level: preset.level }])) as LaneQuality["models"];
  return { mode: "images", skip: 0, every: preset.every, maxFrames: preset.maxFrames, side: preset.side, models };
}

/**
 * Planning prices. Muse Spark follows the agent level. SAM images are $2.50 per 1,000 and SAM video $0.20 per 1,000
 * frames processed, at least 50 per clip (Meta's pricing page). SAM is asked once per concept, so a picture or
 * clip is paid for once per concept. Muse Voice is $0.18 per hour of audio. Not measured yet.
 */
const SAM_IMAGE = 0.0025;
const SAM_VIDEO_FRAME = 0.0002;
const VOICE_PER_MINUTE = 0.003;
/** Concepts Spark names in a typical picture. Up to 4 are allowed (MAX_CONCEPTS in sam.ts). */
export const CONCEPTS = 2;
/**
 * Frames per second SAM video processes. Meta's pages do not say whether it uses every frame of the clip, so this
 * assumes it does, at a typical 30. The first real run reports the true count in usage.video_frames_processed.
 */
export const VIDEO_FPS = 30;

export type Work = { minutes: number };

export function frames(q: LaneQuality, w: Work) {
  return Math.max(1, Math.min(q.maxFrames, Math.ceil((w.minutes * 60) / q.every)));
}

/** Cost of each model for one piece of work, and the total. Models that are off cost nothing. */
export function laneCost(q: LaneQuality, w: Work) {
  const n = frames(q, w);
  const sent = n * (1 - q.skip);
  const size = (q.side / 768) ** 2;
  const clipFrames = Math.ceil(w.minutes * 60 * VIDEO_FPS);
  const per: Record<Capability, number> = {
    reason: q.models.reason.on ? sent * (AGENT_LEVELS[q.models.reason.level].costPer100 / 100) * Math.min(size, 2) : 0,
    segment: q.models.segment.on ? CONCEPTS * (q.mode === "video" ? Math.max(50, clipFrames) * SAM_VIDEO_FRAME : sent * SAM_IMAGE) : 0,
    transcribe: q.models.transcribe.on ? w.minutes * VOICE_PER_MINUTE : 0,
    image: 0,
    world: 0,
  };
  const total = LANE_MODELS.reduce((s, c) => s + per[c], 0);
  return { frames: n, per, total };
}

/** How good the lane's reads are likely to be, 0–100: the weakest dial on the models that are on. */
export function laneAccuracy(q: LaneQuality) {
  const on = LANE_MODELS.filter((c) => q.models[c].on);
  if (!on.length) return 0;
  const model = Math.min(...on.map((c) => AGENT_LEVELS[q.models[c].level].accuracy));
  // SAM video follows each object by its own id, so it keeps identity where separate pictures cannot.
  const follow = q.mode === "video" && q.models.segment.on ? 3 : 0;
  const dense = q.every <= 5 ? 3 : q.every <= 10 ? 0 : q.every <= 30 ? -3 : -6;
  const sharp = q.side >= 1024 ? 2 : q.side >= 768 ? 0 : -3;
  const skipped = q.skip === 0 ? 0 : q.skip <= 0.2 ? -1 : -3;
  return Math.max(0, Math.min(99, model + dense + sharp + follow + skipped));
}

/** What a monthly cap does when the spend reaches it. */
export type CapMode = "pause" | "warn";

export type Budget = { cap: number | null; mode: CapMode; spent: number };

export function budgetState(b: Budget): { pct: number; state: "none" | "ok" | "near" | "over" } {
  if (b.cap === null || b.cap <= 0) return { pct: 0, state: "none" };
  const pct = b.spent / b.cap;
  return { pct, state: pct >= 1 ? "over" : pct >= 0.8 ? "near" : "ok" };
}
