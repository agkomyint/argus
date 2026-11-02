import type { ProductManifestInput } from "../schema";

// 41. Who handled which item, for how long, and whether they left without paying.
// Planned: the shelf-event producer and the checkout source are not built yet. Until they are,
// the widget is previewed in /design with sample events, and the arithmetic is tested in shelf-math.
export const shelfInteractions: ProductManifestInput = {
  id: "shelf-interactions", no: 41, version: "0.1.0", name: "Shelf interactions",
  summary: "Per pickup: how long a person stayed near an item, how long they held it, and whether it was put back, paid for, or carried out. Unpaid carry-outs held past a threshold are flagged for review.",
  category: "business", owner: "ARGUS", kind: "event-stream", level: "L4", status: "planned",
  inputs: [], observationTypes: ["shelf_event"],
  params: [{ name: "min_held_s", description: "Seconds held before a carry-out is flagged", default: 20 }],
  schema: [
    { name: "person", type: "string", description: "Anonymous track id within one recording" },
    { name: "item", type: "string", description: "What was picked up" },
    { name: "zone", type: "string", description: "Shelf zone the pickup happened in" },
    { name: "dwell_ms", type: "integer", unit: "ms", description: "Time in the zone before the pickup" },
    { name: "held_ms", type: "integer", unit: "ms", description: "Time the item was held" },
    { name: "outcome", type: "string", description: "returned, paid, carried_out or in_store" },
    { name: "flagged", type: "boolean", description: "True when the rule marks it for review" },
    { name: "reason", type: "string", description: "Why it was or was not flagged, in words" },
  ],
  evidence: "clip-per-event", quality: ["producer_version_recorded", "rule_applied_by_code"],
  limitations: [
    "Needs a checkout source (point of sale or a register-zone camera); video alone cannot tell whether someone paid.",
    "Models propose pickups and exits; timing and flags are computed by code.",
    "Person ids are per recording and are not identities. Tracking can break across cameras or occlusion.",
    "A flag means review this clip, not that a theft happened.",
  ],
  refresh: "on-demand", outputs: ["event_api", "dashboard"], privacy: "no-person-identification", requiresHumanReview: true,
  widget: { id: "shelf-interactions" },
};
