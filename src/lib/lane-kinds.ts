// The kinds of lane, kept apart from the database schema so browser code can use them without loading drizzle.

/** One number per file: what it is called, its unit, and the range code clamps it to. */
export type LaneTrack = { metric: string; unit: string; min?: number; max?: number };
export const LANE_ANALYZERS = ["objects", "body", "screen"] as const;
export type LaneAnalyzer = (typeof LANE_ANALYZERS)[number];
/** Everything comes in through a lane: files, or one live input per lane. */
export const LANE_INPUTS = ["files", "screen", "weather", "sensor_sim", "webhook"] as const;
export type LaneInput = (typeof LANE_INPUTS)[number];
