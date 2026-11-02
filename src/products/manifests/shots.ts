import type { ProductManifestInput } from "../schema";

// 42. Where a video cuts from one kind of footage to another, and what each shot is.
export const shotTimeline: ProductManifestInput = {
  id: "shot-timeline", no: 42, version: "0.1.0", name: "Shot timeline",
  summary: "Every cut in a video, with when each shot starts and ends and what kind of footage it is (vehicle camera, aerial, still photo, podium, reporter). Cuts are found by code from the pixels; Muse Spark only names the footage.",
  category: "core", owner: "ARGUS", kind: "event-stream", level: "L2", status: "supported",
  inputs: [], observationTypes: ["video_shot"],
  schema: [
    { name: "shot_no", type: "integer", description: "Position of the shot in the video, from 1" },
    { name: "start_ms", type: "integer", unit: "ms", description: "First sampled second of the shot" },
    { name: "start_after_ms", type: "integer", unit: "ms", description: "Last sampled second that belonged to the shot before; the true cut is between this and start_ms" },
    { name: "end_ms", type: "integer", unit: "ms", description: "Where the next shot starts, or the end of the video" },
    { name: "length_ms", type: "integer", unit: "ms", description: "end_ms minus start_ms" },
    { name: "frames", type: "integer", description: "Sampled frames inside the shot" },
    { name: "cut_score", type: "number", description: "How different the first frame was from the one before, 0 to 1" },
    { name: "footage", type: "string", description: "Kind of footage proposed by the model, or unknown" },
    { name: "description", type: "string", description: "One sentence on what the shot shows" },
  ],
  evidence: "clip-per-event", quality: ["cuts_computed_by_code", "producer_version_recorded"],
  limitations: [
    "Frames are sampled about every two seconds, so a cut is placed between two samples and a shot shorter than the gap can be missed.",
    "A slow dissolve or a cut between two very similar views may not be found.",
    "The footage label is a model proposal. Cut times and lengths are computed.",
    "Describes the scene only; never names or identifies a person.",
  ],
  refresh: "on-demand", outputs: ["csv", "dashboard"], privacy: "access-controlled-clips",
  widget: { id: "shot-strip" },
};
