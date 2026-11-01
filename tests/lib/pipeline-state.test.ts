import { describe, expect, test } from "bun:test";
import { GRACE_MS, stuckOf, type FileFacts } from "@/lib/pipeline-state";

const base: FileFacts = { status: "ready", ageMs: GRACE_MS + 1, video: false, jobs: ["done"] };

describe("stuck files", () => {
  test("a healthy or brand new file is never stuck", () => {
    expect(stuckOf(base)).toBeNull();
    expect(stuckOf({ ...base, status: "pending", ageMs: 5_000 })).toBeNull();
    expect(stuckOf({ ...base, jobs: ["failed"], ageMs: GRACE_MS - 1 })).toBeNull();
    expect(stuckOf({ ...base, jobs: [] })).toBeNull();
  });
  test("an upload that was never confirmed is finished", () => {
    expect(stuckOf({ ...base, status: "pending" })).toMatchObject({ kind: "unconfirmed", action: "finish" });
  });
  test("paused work is resumed, ahead of sampling and failures", () => {
    const s = stuckOf({ ...base, video: true, frames: { have: 3, total: 10 }, jobs: ["paused", "paused", "failed"] });
    expect(s).toMatchObject({ kind: "paused", action: "resume" });
    expect(s?.detail).toContain("2 reads");
  });
  test("a video with missing frames continues sampling; a finished or unplanned one does not", () => {
    expect(stuckOf({ ...base, video: true, frames: { have: 0, total: null } })).toMatchObject({ kind: "unsampled", action: "sample" });
    expect(stuckOf({ ...base, video: true, frames: { have: 12, total: 40 } })).toMatchObject({ kind: "partial", label: "Sampling stopped 12/40" });
    expect(stuckOf({ ...base, video: true, frames: { have: 40, total: 40 } })).toBeNull();
    expect(stuckOf({ ...base, video: true, frames: { have: 7, total: null } })).toBeNull();
    expect(stuckOf({ ...base, video: false, frames: { have: 0, total: null } })).toBeNull();
  });
  test("failed reads are retried only when nothing is still running", () => {
    expect(stuckOf({ ...base, jobs: ["failed"] })).toMatchObject({ kind: "failed", action: "retry", label: "1 read failed" });
    expect(stuckOf({ ...base, jobs: ["failed", "failed"] })?.label).toBe("2 reads failed");
    expect(stuckOf({ ...base, jobs: ["failed", "running"] })).toBeNull();
    expect(stuckOf({ ...base, jobs: ["failed", "queued"] })).toBeNull();
  });
});
