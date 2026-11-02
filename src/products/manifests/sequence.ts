import type { ProductManifestInput } from "../schema";

// 43. Road incidents the model points at, with times computed from the frames it points at.
export const incidentTimeline: ProductManifestInput = {
  id: "incident-timeline", no: 43, version: "0.1.0", name: "Incident timeline",
  summary: "When an impact, fire, smoke, stopped traffic, arriving responders or a blocked lane first appears in a video. Muse Spark names the frame and what it sees; code turns the frame into a time and drops guesses that name no real frame.",
  category: "core", owner: "ARGUS", kind: "event-stream", level: "L2", status: "supported",
  inputs: [], observationTypes: ["video_incident"],
  schema: [
    { name: "kind", type: "string", description: "impact, fire, smoke, stopped-traffic, responders-arrive, lane-blocked, debris or other" },
    { name: "description", type: "string", description: "One sentence on what is visible" },
    { name: "at_ms", type: "integer", unit: "ms", description: "Time of the first sampled frame showing it" },
    { name: "frame_no", type: "integer", description: "Which of the frames shown to the model it pointed at" },
  ],
  evidence: "clip-per-event", quality: ["time_computed_from_frame", "model_guesses_verified", "producer_version_recorded"],
  limitations: [
    "At most 16 evenly spread frames are shown to the model, so the time is only as precise as that spacing.",
    "Incidents are model proposals, not confirmed events. Nothing here proves cause or blame.",
    "Describes the scene only; never names or identifies a person.",
  ],
  refresh: "on-demand", outputs: ["csv", "dashboard"], privacy: "access-controlled-clips",
  widget: { id: "event-feed", bind: { title: ["title"] } },
};

// 44. Words printed on screen, read by the model and kept exactly as read.
export const onScreenText: ProductManifestInput = {
  id: "on-screen-text", no: 44, version: "0.1.0", name: "On-screen text",
  summary: "Captions, date stamps, signs and graphics read off each sampled frame, with the time they were on screen. Muse Spark reads the characters; they are stored as read and never corrected.",
  category: "core", owner: "ARGUS", kind: "dataset", level: "L2", status: "supported",
  inputs: [], observationTypes: ["video_text"],
  schema: [
    { name: "text", type: "string", description: "The characters read from the frame" },
    { name: "where", type: "string", description: "caption, stamp, sign, graphic or other" },
    { name: "at_ms", type: "integer", unit: "ms", description: "Time of the frame" },
  ],
  evidence: "clip-per-event", quality: ["producer_version_recorded"],
  limitations: ["Small, blurred or fast-moving text may be misread or missed.", "Sampled frames only, so text shown between samples is not seen.", "Licence plates are not requested."],
  refresh: "on-demand", outputs: ["csv", "dashboard"], privacy: "access-controlled-clips",
  widget: { id: "rows-table", bind: { columns: ["at", "where", "text"] } },
};

// 45. How many emergency vehicles and responders are visible over time.
export const emergencyResponse: ProductManifestInput = {
  id: "emergency-response", no: 45, version: "0.1.0", name: "Emergency response",
  summary: "How many emergency vehicles and uniformed responders are visible in each sampled frame, as a timeline, so you can see when help arrives. Counts are model estimates.",
  category: "core", owner: "ARGUS", kind: "timeseries", level: "L2", status: "supported",
  inputs: [], observationTypes: ["responder_count"],
  schema: [
    { name: "vehicles", type: "integer", description: "Police, fire or ambulance vehicles visible" },
    { name: "people", type: "integer", description: "People who look like uniformed responders" },
    { name: "responders", type: "integer", description: "vehicles plus people" },
    { name: "at_ms", type: "integer", unit: "ms", description: "Time of the frame" },
  ],
  evidence: "aggregate-only", quality: ["producer_version_recorded"],
  limitations: ["Counts are estimates and miss small or hidden people.", "A uniform is not proof of role.", "Counts people only as a number; never identifies anyone."],
  refresh: "on-demand", outputs: ["csv", "dashboard"], privacy: "access-controlled-clips",
  widget: { id: "stat-trend", bind: { value: ["responders"] }, settings: { unit: "responders", caption: "Most visible at once" } },
};

// 46. What was said, set against what the footage shows.
export const claimsVsEvidence: ProductManifestInput = {
  id: "claims-vs-evidence", no: 46, version: "0.1.0", name: "Claims vs evidence",
  summary: "Each factual claim in the speech, marked shown, contradicted or not shown by what the footage actually contains, with the evidence it cites. Muse Spark proposes the verdict; code checks the quote, the turn and every cited Observation, and downgrades anything unsupported to not shown.",
  category: "core", owner: "ARGUS", kind: "event-stream", level: "L3", status: "supported",
  inputs: [], observationTypes: ["claim_check"],
  schema: [
    { name: "claim", type: "string", description: "The claim in plain words" },
    { name: "quote", type: "string", description: "The exact words of the speaker, checked to be in the transcript" },
    { name: "status", type: "string", description: "shown, contradicted or not shown" },
    { name: "evidence", type: "string", description: "Ids of the Observations the verdict relies on" },
    { name: "reason", type: "string", description: "One sentence on the verdict" },
  ],
  evidence: "clip-per-event", quality: ["quotes_verified_in_transcript", "evidence_ids_verified", "unsupported_verdicts_downgraded", "producer_version_recorded"],
  limitations: [
    "Needs both speech and vision Observations in the same project; with only one it writes nothing.",
    "Not shown means the footage does not show it, not that it is false. Causes, motives, legal status and the condition of a person cannot be seen.",
    "Only the first 40 speech turns and 60 pieces of evidence are compared.",
    "Model verdicts can be wrong. Open the cited evidence before relying on one.",
  ],
  refresh: "on-demand", outputs: ["csv", "dashboard"], privacy: "access-controlled-clips",
  widget: { id: "event-feed", bind: { title: ["title"] } },
};
