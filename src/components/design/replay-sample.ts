import type { ReplayData } from "@/lib/replay";

// A made-up six-hour project for /design: screen frames all morning, one batch of photos, one failed frame.
const T0 = Date.UTC(2026, 9, 20, 9, 0);
const m = (min: number) => T0 + min * 60_000;
const frames = Array.from({ length: 12 }, (_, i) => m(20 + i * 15));

export const REPLAY_SAMPLE: ReplayData = {
  start: T0,
  end: m(360),
  nodes: [
    { id: "screen", col: 0, label: "Screen share", sub: "screen", kind: "source", state: "done" },
    { id: "tl:1", col: 0, label: "Site photos", sub: "Files timeline", kind: "source", state: "done" },
    { id: "a:perceive", col: 1, label: "Count people", sub: "Reads each sampled frame", kind: "model", state: "done" },
    { id: "a:inspect", col: 1, label: "Inspect photos", sub: "Objects and defects in files", kind: "model", state: "done" },
    { id: "l:people_count", col: 3, label: "People counts", sub: "people_count", kind: "code", state: "done" },
    { id: "l:defect_detected", col: 3, label: "Defects", sub: "defect_detected", kind: "code", state: "done" },
    { id: "p:people-count", col: 4, label: "People count", sub: "timeseries", kind: "product", state: "done", rate: "" },
    { id: "p:defects", col: 4, label: "Defect log", sub: "dataset", kind: "product", state: "done", rate: "" },
  ],
  edges: [["screen", "a:perceive"], ["tl:1", "a:inspect"], ["a:perceive", "l:people_count"], ["a:inspect", "l:defect_detected"], ["l:people_count", "p:people-count"], ["l:defect_detected", "p:defects"]],
  born: { "p:people-count": m(5), screen: m(10), "a:perceive": m(20), "l:people_count": m(21), "p:defects": m(60), "tl:1": m(65), "a:inspect": m(70), "l:defect_detected": m(72) },
  jobs: [
    ...frames.map((t, i) => ({ nodes: ["screen", "a:perceive"], from: t, to: t + 60_000, failed: i === 6 })),
    ...[70, 71, 72, 73].map((x) => ({ nodes: ["tl:1", "a:inspect"], from: m(x), to: m(x + 2), failed: false })),
  ],
  arrivals: {
    "l:people_count": frames.filter((_, i) => i !== 6).map((t, i) => [t + 60_000, 2 + (i % 4)] as [number, number]),
    "l:defect_detected": [[m(72), 1], [m(74), 2], [m(75), 1]],
  },
  feeds: { "p:people-count": ["l:people_count"], "p:defects": ["l:defect_detected"] },
  events: [
    { t: T0, text: "Project “Bus stop study” created" },
    { t: m(5), text: "Chose the data product People count", node: "p:people-count" },
    { t: m(10), text: "Connected Screen share", node: "screen" },
    ...frames.map((t, i) => ({ t: t + 60_000, text: i === 6 ? "Count people failed on a frame from Screen share" : "Count people finished a frame from Screen share", node: "a:perceive" })),
    { t: m(60), text: "Chose the data product Defect log", node: "p:defects" },
    { t: m(65), text: "Added the files timeline Site photos", node: "tl:1" },
    { t: m(72), text: "First defects rows arrived", node: "l:defect_detected" },
  ].sort((a, b) => a.t - b.t),
};

/** A project made a minute ago: nothing has happened yet. */
export const REPLAY_EMPTY: ReplayData = {
  start: T0,
  end: m(1),
  nodes: [],
  edges: [],
  born: {},
  jobs: [],
  arrivals: {},
  feeds: {},
  events: [{ t: T0, text: "Project “New project” created" }],
};
