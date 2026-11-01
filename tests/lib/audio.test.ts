import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { observations, projectProducts, traces, uploads } from "@/db/schema";
import { transcribeUpload } from "@/sources/audio";
import { wavDuration, wavOf } from "@/sources/audio-plan";
import { laneFeeds, laneProblems } from "@/lib/setup-rules";
import { createLane } from "@/lib/lane-links";
import { loadOwnerView, loadShareView, projectMediaKey } from "@/lib/explore";
import { storeVideoFrame } from "@/sources/video";
import { withTrace } from "@/lib/trace";
import { reset, seedProject } from "../db";
import { putFile } from "../fakes";

const realFetch = globalThis.fetch;
beforeEach(reset);
afterEach(() => { globalThis.fetch = realFetch; delete process.env.META_API_KEY; });

async function recording() {
  const { user, project } = await seedProject();
  const key = `${project.id}/speech.wav`;
  putFile(key, wavOf(new Float32Array(16000 * 2)));
  const [up] = await db.insert(uploads).values({ projectId: project.id, userId: user.id, key, filename: "speech.wav", contentType: "audio/wav", size: 64044, status: "ready" }).returning();
  return up;
}

describe("audio source", () => {
  test("WAV encoder writes PCM and validation rejects unsupported or corrupt audio", () => {
    const wav = wavOf(new Float32Array([-2, -1, 0, 1, 2]));
    expect(wavDuration(wav)).toBe(5 / 16000 * 1000);
    const v = new DataView(wav.buffer as ArrayBuffer);
    expect(v.getInt16(44, true)).toBe(-32768);
    expect(v.getInt16(52, true)).toBe(32767);
    expect(() => wavDuration(new Uint8Array(2))).toThrow();
    expect(() => wavDuration(wavOf(new Float32Array(8), 48000))).toThrow();
    wav[40] = 0; expect(() => wavDuration(wav)).toThrow();
  });

  test("speech and camera feed only products their analyzers can write", () => {
    expect(laneFeeds({ analyzer: "speech", input: "files" }, "speech-log")).toBe(true);
    expect(laneFeeds({ analyzer: "objects", input: "camera" }, "object-detection-dataset")).toBe(true);
    expect(laneFeeds({ analyzer: "objects", input: "camera" }, "speech-log")).toBe(false);
    expect(laneProblems({ name: "Camera", note: "", analyzer: "speech", input: "camera", feeds: [] }, [], [])).toContain("A camera lane finds objects; pick Find objects.");
  });

  test("transcription writes timed turns, traces the model and code, and skips completed retries", async () => {
    const up = await recording(); process.env.META_API_KEY = "test-only";
    const fetcher = mock(async (_url: unknown, init?: RequestInit) => {
      expect(String(_url)).toEndWith("/asr/transcribe");
      expect(init?.body).toBeInstanceOf(FormData);
      return Response.json({ transcript: "Gate clear", audioDurationMs: 2000, turns: [{ turnId: 1, startMs: 400, endMs: 1800, transcript: "Gate clear", speaker: "A" }] });
    });
    globalThis.fetch = fetcher as unknown as typeof fetch;
    await withTrace({ projectId: up.projectId, uploadId: up.id }, () => transcribeUpload(up));
    const rows = await db.select().from(observations).where(eq(observations.uploadId, up.id));
    const turn = rows.find((r) => r.type === "transcript_turn")!;
    expect(turn.payload).toMatchObject({ text: "Gate clear", speaker: "A", at_ms: 400, end_ms: 1800 });
    expect(turn.eventTime.getTime()).toBe(up.createdAt.getTime() + 400);
    const steps = await db.select().from(traces);
    expect(steps.find((t) => t.name === "speech.transcribe")).toMatchObject({ model: "muse-voice-transcribe-1.0", status: "ok", input: { audio: { bytes: 64044 } } });
    expect(steps.find((t) => t.name === "speech.write_turns")?.observationIds).toContain(turn.id);
    await transcribeUpload(up); expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test("failed model calls are traced and write no fabricated turns", async () => {
    const up = await recording(); process.env.META_API_KEY = "test-only";
    globalThis.fetch = mock(async () => new Response("unavailable", { status: 503 })) as unknown as typeof fetch;
    await expect(withTrace({ projectId: up.projectId }, () => transcribeUpload(up))).rejects.toThrow("503");
    expect(await db.select().from(observations)).toHaveLength(0);
    expect((await db.select().from(traces))[0]).toMatchObject({ name: "speech.transcribe", status: "error" });
  });
  test("audio playback obeys the existing media-sharing choice and replay makes no model calls", async () => {
    const up = await recording();
    const fetcher = mock(async () => { throw new Error("Replay must never call a model"); });
    globalThis.fetch = fetcher as unknown as typeof fetch;
    expect((await loadOwnerView(up.projectId)).media?.find((m) => m.id === up.id)?.kind).toBe("audio");
    expect(await projectMediaKey(up.projectId, up.id)).toBe(up.key);
    expect((await loadShareView(up.projectId, "test", false)).media).toBeNull();
    expect((await loadShareView(up.projectId, "test", true)).media?.[0].kind).toBe("audio");
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("camera sessions keep upload ownership and feed frames before the recording finishes", async () => {
    const { project, user } = await seedProject();
    await db.insert(projectProducts).values({ projectId: project.id, productId: "object-detection-dataset" });
    const { lane, source, feeds } = await createLane(project.id, { name: "Gate camera", input: "camera", analyzer: "objects" });
    expect(source).toBeUndefined();
    expect(feeds).toEqual(["object-detection-dataset"]);
    const [up] = await db.insert(uploads).values({ projectId: project.id, userId: user.id, laneId: lane.id, timelineId: lane.timelineId, key: "camera.webm", filename: "camera.webm", contentType: "video/webm", size: 1, status: "pending" }).returning();
    const stored = await withTrace({ projectId: project.id, uploadId: up.id }, () => storeVideoFrame(up, 5000, new Uint8Array([255, 216, 255, 217])));
    expect(stored?.observationId).toBeString();
    expect((await db.select().from(observations))[0]).toMatchObject({ uploadId: up.id, type: "video_frame", payload: { at_ms: 5000 } });
  });

});
