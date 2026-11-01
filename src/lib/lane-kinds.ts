// The kinds of lane, kept apart from the database schema so browser code can use them without loading drizzle.

/** One number per file: what it is called, its unit, and the range code clamps it to. */
export type LaneTrack = { metric: string; unit: string; min?: number; max?: number };
export const LANE_ANALYZERS = ["objects", "body", "screen", "speech"] as const;
export type LaneAnalyzer = (typeof LANE_ANALYZERS)[number];
/** Everything comes in through a lane: files, or one live input per lane. */
export const LANE_INPUTS = ["files", "camera", "screen", "weather", "sensor_sim", "webhook"] as const;
export type LaneInput = (typeof LANE_INPUTS)[number];
/** Inputs whose items are uploads in the lane (dropped files, or one recording per camera session), not rows from a source. */
export const hasUploads = (input: LaneInput) => input === "files" || input === "camera";

/**
 * How a lane's videos are read by SAM. "frames": a picture per sampled frame, each located on its own.
 * "clip": the whole video is sent once per concept and SAM follows each object, keeping its id.
 */
export const VIDEO_READS = ["frames", "clip"] as const;
export type VideoRead = (typeof VIDEO_READS)[number];
export const VIDEO_READ_LABEL: Record<VideoRead, { name: string; does: string }> = {
  frames: { name: "A picture per frame", does: "Each sampled frame is read on its own. Cheap and simple, but the same object is a new find in every frame." },
  clip: { name: "The whole clip, tracked", does: "SAM follows each object through the video and keeps its id, so one chair stays one chair. Billed for every frame SAM processes, so best for short clips." },
};
/** Only a lane of files that looks for objects has anything to track. */
export const canReadClip = (lane: { input?: LaneInput; analyzer: LaneAnalyzer }) => (lane.input ?? "files") === "files" && lane.analyzer === "objects";
