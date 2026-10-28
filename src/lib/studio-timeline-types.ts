import type { LaneAnalyzer, LaneInput } from "@/lib/lane-kinds";

/** One recorded step on the way from a file to rows: a model call, a code check or a tool call. */
export type TlStep = {
  id: string;
  t: number;
  kind: "model" | "code" | "tool";
  name: string;
  model: string | null;
  ms: number;
  ok: boolean;
  tokens: number | null;
  /** How many Observations the step wrote. */
  wrote: number;
  /** Only in the owner's studio. */
  error?: string;
};

/**
 * One thing that came into a lane: a file, a frame of a video or a screen, or a minute of live readings.
 * `rows` are the ids of the Observations it became, so the studio can find the media and the product rows it fed.
 */
export type TlItem = {
  id: string;
  kind: "file" | "frame" | "reading";
  t: number;
  /** When the last step for it finished: the dot fills here. */
  done: number;
  state: "waiting" | "reading" | "done" | "failed";
  label: string;
  steps: TlStep[];
  rows: string[];
};

export type TlLane = { id: string; name: string; input: LaneInput; analyzer: LaneAnalyzer; feeds: string[]; items: TlItem[]; locked?: boolean };

/** Everything that came in through each lane and what the AI did with it. `other` holds steps that belong to no lane, such as setup and Ask ARGUS. */
export type StudioTimeline = { lanes: TlLane[]; other: TlStep[] };

export const EMPTY_TIMELINE: StudioTimeline = { lanes: [], other: [] };
