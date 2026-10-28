import type { ReplayData } from "@/lib/replay";
import type { Dataset, Row } from "@/lib/product-types";
import type { ShareMedia, ShareView } from "@/lib/share-types";
import type { StudioTimeline, TlItem, TlStep } from "@/lib/studio-timeline-types";
import type { PublicProduct, PublicProject } from "./public-studio";

// A made-up six-hour bus stop study for /design: screen frames all morning, then a batch of site photos.
const T0 = Date.UTC(2026, 9, 20, 9, 0);
const m = (min: number) => T0 + min * 60_000;
const frames = Array.from({ length: 12 }, (_, i) => m(20 + i * 15));
const counts = [3, 5, 4, 7, 9, 6, 0, 8, 11, 7, 5, 4];
const photos = [70, 71, 72, 73];

export const PUBLIC_PROJECT: PublicProject = { slug: "sample", name: "Bus stop study", kind: "Transit stop", owner: "Aung", createdAt: T0, sharedAt: m(300) };

export const PUBLIC_REPLAY: ReplayData = {
  start: T0,
  end: m(360),
  nodes: [
    { id: "screen", col: 0, label: "Screen share", sub: "screen", kind: "source", state: "done" },
    { id: "tl:1", col: 0, label: "Site photos", sub: "Files timeline", kind: "source", state: "done" },
    { id: "a:perceive", col: 1, label: "Count people", sub: "Reads each sampled frame", kind: "model", state: "done" },
    { id: "a:inspect", col: 1, label: "Inspect photos", sub: "Objects and defects in files", kind: "model", state: "done" },
    { id: "l:people_count", col: 3, label: "People counts", sub: "people_count", kind: "code", state: "done" },
    { id: "l:object_detected", col: 3, label: "Object detections", sub: "object_detected", kind: "code", state: "done" },
    { id: "p:people-count", col: 4, label: "People count", sub: "timeseries", kind: "product", state: "done", rate: "" },
    { id: "p:object-detection-dataset", col: 4, label: "Object detection dataset", sub: "dataset", kind: "product", state: "done", rate: "" },
  ],
  edges: [
    ["screen", "a:perceive"], ["tl:1", "a:inspect"], ["a:perceive", "l:people_count"], ["a:inspect", "l:object_detected"],
    ["l:people_count", "p:people-count"], ["l:object_detected", "p:object-detection-dataset"],
  ],
  born: { "p:people-count": m(5), screen: m(10), "a:perceive": m(20), "l:people_count": m(21), "p:object-detection-dataset": m(60), "tl:1": m(65), "a:inspect": m(70), "l:object_detected": m(72) },
  jobs: [
    ...frames.map((t, i) => ({ nodes: ["screen", "a:perceive"], from: t, to: t + 60_000, failed: i === 6 })),
    ...photos.map((x) => ({ nodes: ["tl:1", "a:inspect"], from: m(x), to: m(x + 2), failed: false })),
  ],
  arrivals: {
    "l:people_count": frames.flatMap((t, i) => (i === 6 ? [] : [[t + 60_000, 1] as [number, number]])),
    "l:object_detected": photos.map((x) => [m(x + 2), 2] as [number, number]),
  },
  feeds: { "p:people-count": ["l:people_count"], "p:object-detection-dataset": ["l:object_detected"] },
  events: [
    { t: T0, text: "Project “Bus stop study” created" },
    { t: m(5), text: "Chose the data product People count", node: "p:people-count" },
    { t: m(10), text: "Connected Screen share", node: "screen" },
    ...frames.map((t, i) => ({ t: t + 60_000, text: i === 6 ? "Count people failed on a frame from Screen share" : "Count people finished a frame from Screen share", node: "a:perceive" })),
    { t: m(21), text: "First people counts rows arrived", node: "l:people_count" },
    { t: m(60), text: "Chose the data product Object detection dataset", node: "p:object-detection-dataset" },
    { t: m(65), text: "Added the files timeline Site photos", node: "tl:1" },
    ...photos.map((x) => ({ t: m(x + 2), text: "Inspect photos finished a file from Site photos", node: "a:inspect" })),
  ].sort((a, b) => a.t - b.t),
};

const OBJECTS = [["bench", 0.94], ["bus shelter", 0.91], ["bicycle", 0.83], ["bin", 0.88], ["sign", 0.9], ["person", 0.86], ["bench", 0.92], ["car", 0.8]] as const;
const peopleRows: Row[] = frames.flatMap((t, i) => (i === 6 ? [] : [{ id: `pc${i}`, type: "people_count", t, arrived: t + 60_000, payload: { count: counts[i] } }]));
const objectRows: Row[] = photos.flatMap((x, i) => [0, 1].map((k) => {
  const [label, conf] = OBJECTS[i * 2 + k];
  return { id: `od${i}${k}`, type: "object_detected", t: m(x), arrived: m(x + 2), payload: { label, object_class: label, confidence: conf } };
}));
const ds = (type: string, rows: Row[]): Dataset => ({ type, total: rows.length, latest: rows.length ? Math.max(...rows.map((r) => r.t)) : null, rows: [...rows].reverse() });

export const PUBLIC_PRODUCTS: PublicProduct[] = [
  { id: "people-count", name: "People count", summary: "How many people are in view, frame by frame.", data: [ds("people_count", peopleRows)] },
  { id: "object-detection-dataset", name: "Object detection dataset", summary: "Every object the model found, with class and confidence.", data: [ds("object_detected", objectRows), ds("object_track", [])] },
];

/** A drawn stand-in for a camera frame: a street, a shelter and one figure per person counted. */
function scene(people: number, seed: number, photo = false) {
  const figs = Array.from({ length: people }, (_, i) => {
    const x = 60 + ((i * 97 + seed * 41) % 520);
    const y = 230 + ((i * 53 + seed * 17) % 60);
    return `<g fill="#8fb4ff" opacity="${0.55 + ((i * 13) % 40) / 100}"><circle cx="${x}" cy="${y - 34}" r="9"/><rect x="${x - 9}" y="${y - 24}" width="18" height="34" rx="6"/></g>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${photo ? "#243042" : "#101a2c"}"/><stop offset="1" stop-color="#05070c"/></linearGradient></defs><rect width="640" height="360" fill="url(#s)"/><rect y="290" width="640" height="70" fill="#1a1f29"/><rect x="0" y="318" width="640" height="4" fill="#3b4252" opacity=".6"/><g fill="none" stroke="#5c6b85" stroke-width="4"><path d="M380 120h200v140"/><path d="M380 120v140"/></g><rect x="390" y="128" width="180" height="10" fill="#2e7cf6" opacity=".55"/><rect x="420" y="236" width="120" height="10" fill="#3b4252"/>${figs}<text x="16" y="28" font-family="monospace" font-size="14" fill="#7a869a">${photo ? `IMG_${2040 + seed}.jpg` : `CAM · frame ${seed + 1}`}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const media: ShareMedia[] = [
  ...frames.flatMap((t, i) => (i === 6 ? [] : [{
    id: `f${i}`, kind: "frame" as const, t: t + 60_000, name: "Screen frame", src: scene(counts[i], i), source: "screen",
    findings: [{ type: "people_count", label: `${counts[i]} people`, confidence: null }],
  }])),
  ...photos.map((x, i) => ({
    id: `u${i}`, kind: "image" as const, t: m(x + 2), name: `IMG_${2040 + i}.jpg`, src: scene(i % 2, i + 20, true), source: "tl:1",
    findings: [0, 1].map((k) => ({ type: "object_detected", label: OBJECTS[i * 2 + k][0], confidence: OBJECTS[i * 2 + k][1], detail: "Seen in the photo" })),
  })),
  { id: "v0", kind: "video" as const, t: m(80), name: "walkthrough.mp4", src: "", source: "tl:1", findings: [] },
].sort((a, b) => a.t - b.t);

const producers: ShareView["producers"] = {
  "l:people_count": { model: "muse-spark-1.3", connector: "screen-share" },
  "l:object_detected": { model: "muse-spark-1.3", connector: "image-upload" },
};
const samples: ShareView["samples"] = {
  "l:people_count": peopleRows.slice(-2).reverse().map((r) => ({ t: r.t, payload: r.payload, confidence: null })),
  "l:object_detected": objectRows.slice(-2).reverse().map((r) => ({ t: r.t, payload: { label: r.payload.label, object_class: r.payload.object_class }, confidence: Number(r.payload.confidence) })),
};

export const PUBLIC_VIEW: ShareView = { media, producers, samples };
export const PUBLIC_VIEW_PRIVATE: ShareView = { media: null, producers, samples };

// The same study as lanes for the studio timeline: each frame and photo, the steps that read it, and the rows it became.
const step = (id: string, t: number, kind: TlStep["kind"], name: string, wrote: number, ok = true): TlStep => ({
  id, t, kind, name, model: kind === "model" ? "muse-spark-1.3" : null, ms: kind === "model" ? 2400 + (t % 900) : 4, ok,
  tokens: kind === "model" ? 1300 + (t % 400) : null, wrote, ...(ok ? {} : { error: "The model reply was not valid JSON; the job gave up after 3 tries" }),
});
const frameItems: TlItem[] = frames.map((t, i) => ({
  id: `f${i}`, kind: "frame", t, done: t + 60_000, state: i === 6 ? "failed" : "done", label: `Screen frame ${i + 1}`,
  steps: [step(`sf${i}`, t + 20_000, "model", "perception.people", i === 6 ? 0 : 1, i !== 6), ...(i === 6 ? [] : [step(`sc${i}`, t + 60_000, "code", "people_count.check", 1)])],
  rows: i === 6 ? [] : [`f${i}`, `pc${i}`],
}));
const photoItems: TlItem[] = [
  ...photos.map((x, i): TlItem => ({
    id: `u${i}`, kind: "file", t: m(x), done: m(x + 2), state: "done", label: `IMG_${2040 + i}.jpg`,
    steps: [step(`pi${i}`, m(x + 1), "model", "perception.image", 0), step(`po${i}`, m(x + 2), "code", "observations.write", 2)],
    rows: [`u${i}`, `od${i}0`, `od${i}1`],
  })),
  { id: "v0", kind: "file", t: m(80), done: m(80), state: "done", label: "walkthrough.mp4", steps: [], rows: [] },
];

export const PUBLIC_TIMELINE: StudioTimeline = {
  lanes: [
    { id: "screen", name: "Screen share", input: "screen", analyzer: "screen", feeds: ["people-count"], items: frameItems },
    { id: "tl:1", name: "Site photos", input: "files", analyzer: "objects", feeds: ["object-detection-dataset"], items: photoItems },
  ],
  other: [step("ls0", m(64), "model", "lanes.suggest_one", 0), step("ls1", m(65), "code", "lanes.check_one", 0)],
};

/** The study while it is still being read: two photos waiting, one being read now. */
export const PUBLIC_TIMELINE_BUSY: StudioTimeline = {
  ...PUBLIC_TIMELINE,
  lanes: PUBLIC_TIMELINE.lanes.map((l) => l.id !== "tl:1" ? l : {
    ...l,
    items: [...l.items, ...[0, 1, 2].map((k): TlItem => ({ id: `w${k}`, kind: "file", t: m(340 + k), done: m(340 + k), state: k === 0 ? "reading" : "waiting", label: `IMG_${2060 + k}.jpg`, steps: [], rows: [] }))],
  }),
};

/** Body check-ins in a public replay: the lane is locked and nothing in it is shown. */
export const PUBLIC_TIMELINE_LOCKED: StudioTimeline = {
  ...PUBLIC_TIMELINE,
  lanes: [...PUBLIC_TIMELINE.lanes, {
    id: "body", name: "Front pics", input: "files", analyzer: "body", feeds: [], locked: true,
    items: [0, 1, 2].map((k): TlItem => ({ id: `b${k}`, kind: "file", t: m(100 + k * 60), done: m(101 + k * 60), state: "done", label: `Check-in ${k + 1}`, steps: [step(`bb${k}`, m(101 + k * 60), "model", "body.check", 3)], rows: [] })),
  }],
};

/** A drawn site photo with a truck and a worker, and the outlines SAM would give each, in the picture's own pixels. */
const SITE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><rect width="640" height="360" fill="#1b2432"/><rect y="250" width="640" height="110" fill="#2a2a26"/><path d="M90 300V200h150l40 45v55z" fill="#c9a227"/><rect x="110" y="215" width="60" height="35" fill="#26313f"/><circle cx="130" cy="305" r="18" fill="#111"/><circle cx="250" cy="305" r="18" fill="#111"/><g fill="#d9773a"><circle cx="452" cy="214" r="10"/><rect x="442" y="226" width="20" height="48" rx="6"/></g><text x="16" y="28" font-family="monospace" font-size="14" fill="#7a869a">site-cam-04.jpg</text></svg>`;

export const MASKED_MEDIA: ShareMedia = {
  id: "masked", kind: "image", t: m(30), name: "site-cam-04.jpg", src: `data:image/svg+xml;utf8,${encodeURIComponent(SITE)}`, source: "tl:1",
  findings: [
    { type: "object_detected", label: "truck", confidence: 0.91, detail: "Yellow tipper truck on the left" },
    { type: "object_detected", label: "person", confidence: 0.84, detail: "Worker in orange by the fence" },
    { type: "object_mask", label: "truck", confidence: 0.88, place: { frame: [640, 360], box: [90, 200, 280, 323], outline: "M90 200L240 200L280 245L280 300L268 323L112 323L90 300Z" } },
    { type: "object_mask", label: "person", confidence: 0.79, place: { frame: [640, 360], box: [442, 204, 462, 274], outline: "M447 204L457 204L462 214L462 274L442 274L442 214Z" } },
  ],
};

/** The same photo before any product asked SAM where things are: names only. */
export const NAMED_MEDIA: ShareMedia = { ...MASKED_MEDIA, id: "named", findings: MASKED_MEDIA.findings.filter((f) => f.type !== "object_mask") };
