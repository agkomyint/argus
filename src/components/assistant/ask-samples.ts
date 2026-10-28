import type { AskMessage, AskProject } from "@/lib/assistant";

/** Sample projects for the Ask ARGUS previews. Ids match the DECK slides. */
export const ASK_PROJECTS: AskProject[] = [
  { id: "deck-a", name: "Harbor Bridge monitoring", kind: "Bridge", products: ["People count", "Density heatmap", "Vehicle traffic", "Defect log"] },
  { id: "deck-b", name: "Bus stop study", kind: "General", products: ["Vehicle traffic dashboard", "People count"] },
  { id: "deck-c", name: "Body log", kind: "General", products: [] },
];

/** A recorded exchange: one @-mention, two lookups by code, an answer that cites them. No model call. */
export const ASK_RECORDED: AskMessage[] = [
  {
    id: "u1",
    role: "user",
    metadata: { mentions: ["deck-a"] },
    parts: [{ type: "text", text: "When was it busiest, and how many people at the peak?" }],
  },
  {
    id: "a1",
    role: "assistant",
    parts: [
      { type: "tool-listProjects", toolCallId: "t1", state: "output-available", input: {}, output: [{ id: "deck-a", name: "Harbor Bridge monitoring", products: [{ id: "people-count", name: "People count" }] }] },
      {
        type: "tool-describeProduct",
        toolCallId: "t2",
        state: "output-available",
        input: { project: "deck-a", product: "people-count" },
        output: { product: "People count", datasets: [{ type: "person_count", totalRows: 1240, rowsSummarised: 500, from: "2026-10-26T06:00:00.000Z", to: "2026-10-26T19:58:00.000Z", busiestHourUtc: { hour: 8, rows: 61 }, fields: { count: { min: 0, max: 37, mean: 11.4, last: 9 } } }] },
      },
      { type: "text", text: "The bridge was busiest at **08:00–09:00 UTC**, with **61 readings** in that hour.\n\n- Peak count in one frame: **37 people**\n- Average across the day: **11.4**\n- Latest reading: **9**\n\nFrom *Harbor Bridge monitoring › People count*, 1,240 rows." },
    ],
  } as AskMessage,
];
