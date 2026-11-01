import type { ProductManifestInput } from "../schema";

export const speechLog: ProductManifestInput = {
  id: "speech-log", no: 40, version: "1.0.0", name: "Speech log",
  summary: "What was said and when, with speaker labels from Muse Voice Transcribe.",
  category: "core", owner: "ARGUS", kind: "event-stream", level: "L2", status: "supported",
  inputs: [], observationTypes: ["transcript_turn"],
  schema: [
    { name: "text", type: "string", description: "Recognized speech" },
    { name: "speaker", type: "string", description: "Speaker label within this recording" },
    { name: "at_ms", type: "integer", unit: "ms", description: "Turn start in the recording" },
    { name: "end_ms", type: "integer", unit: "ms", description: "Turn end in the recording" },
  ],
  evidence: "clip-per-event", quality: ["producer_version_recorded", "turn_timestamps"],
  limitations: ["Speech recognition may mishear words.", "Speaker labels are local to one recording, not verified identities.", "Turn timestamps, not word timestamps. Recordings are limited to nine minutes."],
  refresh: "on-demand", outputs: ["csv", "dashboard"], privacy: "access-controlled-clips",
  widget: { id: "speech-log" },
};
