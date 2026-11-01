import { samplingStage, type FrameCount } from "@/sources/video-plan";

/**
 * Where a file got stuck on its way from upload to read, and the one thing a person can do about it.
 * Plain arithmetic over what the database already knows, so the same facts always give the same answer.
 */

/** A file this young may simply still be on its way, so it is never called stuck. */
export const GRACE_MS = 2 * 60_000;

export type StuckKind = "unconfirmed" | "paused" | "unsampled" | "partial" | "failed";
export type StuckAction = "finish" | "resume" | "sample" | "retry";

export type FileFacts = {
  status: "pending" | "ready";
  ageMs: number;
  /** A video file whose frames are sampled in the browser. A live camera recording is not. */
  video: boolean;
  frames?: FrameCount;
  /** The status of every job that belongs to this file. */
  jobs: string[];
};

export type Stuck = { kind: StuckKind; action: StuckAction; label: string; detail: string };

/** One stuck file as the studio shows it. */
export type StuckFile = Stuck & { id: string; laneId: string; lane: string; filename: string; source?: string };

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** The most urgent thing wrong with this file, or null when it is fine or too new to tell. */
export function stuckOf(f: FileFacts): Stuck | null {
  if (f.ageMs < GRACE_MS) return null;
  if (f.status === "pending") return { kind: "unconfirmed", action: "finish", label: "Upload not confirmed", detail: "The file was sent but ARGUS never marked it ready." };

  const held = f.jobs.filter((s) => s === "paused").length;
  if (held) return { kind: "paused", action: "resume", label: "Source paused", detail: `${plural(held, "read")} held until the source is resumed.` };

  if (f.video && f.frames) {
    const stage = samplingStage(f.frames);
    if (stage === "none") return { kind: "unsampled", action: "sample", label: "Not sampled", detail: "No frames were stored for this video." };
    if (stage === "partial") return { kind: "partial", action: "sample", label: `Sampling stopped ${f.frames.have}/${f.frames.total}`, detail: "Only the missing seconds are sent; nothing is read twice." };
  }

  const failed = f.jobs.filter((s) => s === "failed").length;
  const active = f.jobs.some((s) => s === "queued" || s === "running");
  if (failed && !active) return { kind: "failed", action: "retry", label: `${plural(failed, "read")} failed`, detail: "Tried 3 times. Retry gives them a fresh set of tries." };
  return null;
}

export const ACTION_LABEL: Record<StuckAction, string> = { finish: "Finish upload", resume: "Resume", sample: "Continue sampling", retry: "Retry" };
