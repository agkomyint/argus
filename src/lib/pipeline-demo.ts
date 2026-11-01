import { stuckOf, type FileFacts, type StuckFile } from "@/lib/pipeline-state";

/** Made-up stuck files, one of each kind. For /design and for `?pipeline=demo` on a studio; never real data. */
const AGE = 10 * 60_000;
const row = (id: string, laneId: string, filename: string, facts: Omit<FileFacts, "ageMs" | "status"> & { status?: FileFacts["status"] }, source?: string): StuckFile[] => {
  const s = stuckOf({ status: "ready", ageMs: AGE, ...facts });
  return s ? [{ ...s, id, laneId, lane: laneId === "gym" ? "Gym clips" : "Front photo", filename, source }] : [];
};

export const DEMO_STUCK: StuckFile[] = [
  ...row("a", "gym", "peak.mp4", { video: true, frames: { have: 12, total: 40 }, jobs: ["done"] }),
  ...row("b", "gym", "warmup.mp4", { video: true, frames: { have: 0, total: null }, jobs: [] }),
  ...row("c", "front", "front-9.jpg", { video: false, jobs: ["failed", "failed"] }),
  ...row("d", "front", "front-10.jpg", { video: false, jobs: ["paused", "paused", "paused"] }, "tl:00000000-0000-0000-0000-000000000000"),
  ...row("e", "front", "front-11.jpg", { status: "pending", video: false, jobs: [] }),
];
