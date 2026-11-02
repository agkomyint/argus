import "server-only";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { observations, uploads } from "@/db/schema";
import { s3 } from "@/lib/s3";
import { recordObservation } from "@/lib/observations";
import { traced } from "@/lib/trace";
import { clock } from "./video-plan";
import { wavDuration } from "./audio-plan";
import { queueClaims } from "./claims";

const reply = z.object({ transcript: z.string(), audioDurationMs: z.number().nonnegative(), turns: z.array(z.object({ turnId: z.number(), startMs: z.number().nonnegative(), endMs: z.number().nonnegative(), transcript: z.string(), speaker: z.string().optional() })) });

export async function transcribeUpload(up: typeof uploads.$inferSelect) {
  const bytes = new Uint8Array(await s3.file(up.key).arrayBuffer());
  const duration = wavDuration(bytes);
  const model = process.env.META_TRANSCRIBE_MODEL ?? "muse-voice-transcribe-1.0";
  // Queue retries must not transcribe an already completed recording again (including silence).
  const done = await db.select({ id: observations.id }).from(observations).where(and(eq(observations.uploadId, up.id), eq(observations.type, "audio_transcribed"))).limit(1);
  if (done.length) return { skipped: "Already transcribed" };
  const result = await traced({ kind: "model", name: "speech.transcribe", model, input: { audio: bytes, durationMs: duration, mode: "DIARIZATION" }, output: (r) => ({ turns: r.turns, durationMs: r.audioDurationMs }) }, async () => {
    if (!process.env.META_API_KEY) throw new Error("Meta API key is not configured");
    const form = new FormData();
    form.append("request", new Blob([JSON.stringify({ model, mode: "DIARIZATION", audioEncoding: "WAV" })], { type: "application/json" }));
    form.append("audio", new Blob([bytes.buffer as ArrayBuffer], { type: "audio/wav" }), "recording.wav");
    const res = await fetch(`${(process.env.META_BASE_URL ?? "https://api.meta.ai/v1").replace(/\/$/, "")}/asr/transcribe`, { method: "POST", headers: { Authorization: `Bearer ${process.env.META_API_KEY}` }, body: form, signal: AbortSignal.timeout(180_000) });
    if (!res.ok) throw new Error(`Muse Voice returned ${res.status}`);
    return reply.parse(await res.json());
  });
  const ids = await traced({ kind: "code", name: "speech.write_turns", input: { upload: up.id, turns: result.turns.length }, observations: (r) => r, output: (r) => ({ written: r.length }) }, async () => {
    // Clean up an interrupted attempt before writing this run.
    await db.delete(observations).where(and(eq(observations.uploadId, up.id), eq(observations.type, "transcript_turn")));
    const ids: string[] = [];
    const base = { projectId: up.projectId, uploadId: up.id, provenance: { connector: "audio-upload", producer: model, upload_id: up.id } };
    for (const t of result.turns) {
      if (!t.transcript.trim() || t.endMs < t.startMs || t.endMs > duration + 1000) continue;
      ids.push((await recordObservation({ ...base, type: "transcript_turn", eventTime: new Date(up.createdAt.getTime() + t.startMs), payload: { text: t.transcript, speaker: t.speaker ?? "Unknown", at_ms: t.startMs, end_ms: t.endMs, at: clock(t.startMs), turn_id: t.turnId, upload_id: up.id, file: up.filename } })).id);
    }
    ids.push((await recordObservation({ ...base, type: "audio_transcribed", eventTime: up.createdAt, payload: { duration_ms: duration, turns: ids.length } })).id);
    return ids;
  });
  await queueClaims(up.projectId);
  return { speech: true, observations: ids.length };
}
