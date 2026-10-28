import type { ComponentType } from "react";
import { BodyCompare } from "@/widgets/library/body-compare";
import { BodyProgress } from "@/widgets/library/body-progress";
import { CategoryBars } from "@/widgets/library/category-bars";
import { CheckinStreak } from "@/widgets/library/checkin-streak";
import { DetectionBoard } from "@/widgets/library/detection-board";
import { EventFeed } from "@/widgets/library/event-feed";
import { HeatGrid } from "@/widgets/library/heat-grid";
import { FrictionLog } from "@/widgets/library/friction-log";
import { Footprint } from "@/widgets/library/footprint";
import { PerceptionMap } from "@/widgets/library/perception-map";
import { PersonaAgreement } from "@/widgets/library/persona-agreement";
import { RowsTable } from "@/widgets/library/rows-table";
import { PERSONAS } from "@/lib/personas";
import { agreementOf } from "@/lib/persona-math";
import { BODY_REGIONS, progressOf, type BodyCheck } from "@/lib/body-math";
import { StackedShare } from "@/widgets/library/stacked-share";
import { StatTrend } from "@/widgets/library/stat-trend";
import { VolumeBars } from "@/widgets/library/volume-bars";
import { sampleTimes, T0, wave } from "@/widgets/kit";
import { defineWidget } from "@/widgets/manifest";
import type { FlatRow, WidgetManifest, WidgetManifestInput, WidgetProps } from "@/widgets/schema";

export type WidgetEntry = {
  manifest: WidgetManifest;
  Component: ComponentType<WidgetProps>;
  /** Deterministic rows used for previews and the design page, shaped for the given binding. */
  sample: (bind: Record<string, string[]>) => FlatRow[];
};

/** Pseudo-random in [0,1), seeded so samples never drift between server and client. */
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

// To plug in a widget: write its component in ./library, describe it here, add it to REGISTRY.
const statTrend: WidgetManifestInput = {
  id: "stat-trend",
  version: "1.0.0",
  name: "Stat and trend",
  summary: "One number that matters, the line it moves along, and its busiest moment.",
  shape: "number",
  slots: [{ key: "value", label: "Value", hint: "Numeric field to track over time", required: true, default: ["count"] }],
  settings: [
    { key: "unit", label: "Unit", kind: "text", default: "readings" },
    { key: "caption", label: "Caption", kind: "text", default: "Latest reading" },
  ],
};

const stackedShare: WidgetManifestInput = {
  id: "stacked-share",
  version: "1.0.0",
  name: "Stacked share",
  summary: "How a whole splits into parts, overall as a ring and over time as 100% bars.",
  shape: "share",
  slots: [{ key: "parts", label: "Parts", hint: "Numeric fields that add up to the whole", required: true, multiple: true, default: ["a", "b"] }],
  settings: [
    { key: "labels", label: "Part labels", kind: "text", default: "" },
    { key: "totalLabel", label: "Total label", kind: "text", default: "in total" },
  ],
};

const volumeBars: WidgetManifestInput = {
  id: "volume-bars",
  version: "1.0.0",
  name: "Volume bars",
  summary: "How much data arrived, per day or per hour. Works on any product.",
  shape: "series",
  slots: [],
  settings: [{ key: "caption", label: "Caption", kind: "text", default: "Rows" }],
};

const categoryBars: WidgetManifestInput = {
  id: "category-bars",
  version: "1.0.0",
  name: "Category bars",
  summary: "Which label is biggest: rows (or a summed value) per category, ranked.",
  shape: "ranking",
  slots: [
    { key: "category", label: "Category", hint: "Text field to group by", required: true, default: ["class"] },
    { key: "value", label: "Weight", hint: "Optional numeric field to sum instead of counting rows", default: [] },
  ],
  settings: [
    { key: "top", label: "Show top", kind: "number", default: 6 },
    { key: "sumValue", label: "Sum the weight field", kind: "toggle", default: false },
  ],
};

const detectionBoard: WidgetManifestInput = {
  id: "detection-board",
  version: "1.0.0",
  name: "Detection board",
  summary: "What was found, how often and when: totals, kinds over time, and the newest finds in the model's words.",
  shape: "ranking",
  slots: [{ key: "category", label: "Kind", hint: "Text field naming what was found", required: true, default: ["label"] }],
  settings: [
    { key: "top", label: "Kinds to list", kind: "number", default: 6 },
    { key: "latest", label: "Newest finds", kind: "number", default: 5 },
  ],
};

const eventFeed: WidgetManifestInput = {
  id: "event-feed",
  version: "1.0.0",
  name: "Event feed",
  summary: "The newest things that happened, one line each, newest flagged.",
  shape: "feed",
  slots: [{ key: "title", label: "Title", hint: "Text field to show on each line", required: true, default: ["title"] }],
  settings: [{ key: "limit", label: "Lines", kind: "number", default: 8 }],
};

const heatGrid: WidgetManifestInput = {
  id: "heat-grid",
  version: "1.0.0",
  name: "Heat grid",
  summary: "Where things concentrate: points binned on a grid, darker means more.",
  shape: "grid",
  slots: [
    { key: "x", label: "X", hint: "Numeric field for the horizontal position", required: true, default: ["x"] },
    { key: "y", label: "Y", hint: "Numeric field for the vertical position", required: true, default: ["y"] },
  ],
  settings: [],
};

const footprint: WidgetManifestInput = {
  id: "footprint",
  version: "1.0.0",
  name: "Footprint",
  summary: "Where each kind of object is and how much of the frame it covers, drawn from its outline.",
  shape: "grid",
  slots: [{ key: "category", label: "Kind", hint: "Text field naming the object", required: true, default: ["label"] }],
  settings: [{ key: "top", label: "Kinds to list", kind: "number", default: 6 }],
};

/** A made-up outline: a rough blob around (cx, cy), so samples look like masks rather than boxes. */
const blob = (cx: number, cy: number, rx: number, ry: number, wobble: number) => {
  const pts = Array.from({ length: 10 }, (_, k) => {
    const a = (k / 10) * Math.PI * 2;
    const f = 1 + Math.sin(a * 3 + wobble) * 0.12;
    return `${Math.round(cx + Math.cos(a) * rx * f)} ${Math.round(cy + Math.sin(a) * ry * f)}`;
  });
  return `M${pts.join("L")}Z`;
};

// Six frames of a site camera: a truck crossing, a person by the gate, the crane cab overhead.
export const footprintSample = (): FlatRow[] =>
  Array.from({ length: 6 }, (_, f) => {
    const t = T0 + f * 2000;
    const at = `00:${String(f * 2).padStart(2, "0")}`;
    const things: [string, number, number, number, number][] = [
      ["truck", 180 + f * 90, 560, 150, 80],
      ["person", 860, 600 - f * 6, 22, 60],
      ...(f % 2 === 0 ? [["crane cab", 640, 220, 70, 50] as [string, number, number, number, number]] : []),
    ];
    return things.map(([label, cx, cy, rx, ry], i) => ({
      t, type: "object_mask", at, label, object_class: label, frame: [1024, 768], box: [cx - rx, cy - ry, cx + rx, cy + ry],
      outline: blob(cx, cy, rx, ry, f + i), x: cx / 1024, y: cy / 768, area_pct: Math.round(((Math.PI * rx * ry) / (1024 * 768)) * 10000) / 100, confidence: 0.7 + i * 0.08,
    }) as FlatRow);
  }).flat();

const rowsTable: WidgetManifestInput = {
  id: "rows-table",
  version: "1.0.0",
  name: "Rows table",
  summary: "The raw rows, newest first. The fallback for any product.",
  shape: "table",
  slots: [{ key: "columns", label: "Columns", hint: "Fields to show. Empty shows the first five.", multiple: true, default: [] }],
  settings: [{ key: "limit", label: "Rows", kind: "number", default: 10 }],
};

const perceptionMap: WidgetManifestInput = {
  id: "perception-map",
  version: "1.0.0",
  name: "Perception map",
  summary: "A screenshot as each simulated visitor saw it: heat where they looked, first looks numbered, pins where they got stuck.",
  shape: "grid",
  slots: [],
  settings: [],
};

const personaAgreementW: WidgetManifestInput = {
  id: "persona-agreement",
  version: "1.0.0",
  name: "Persona agreement",
  summary: "Per screen, how much the visitors looked at the same things, with clarity and who would carry on.",
  shape: "ranking",
  slots: [],
  settings: [],
};

const frictionLogW: WidgetManifestInput = {
  id: "friction-log",
  version: "1.0.0",
  name: "Friction log",
  summary: "Where visitors got stuck, worst first, filterable by severity.",
  shape: "feed",
  slots: [],
  settings: [{ key: "limit", label: "Lines", kind: "number", default: 40 }],
};

// A small made-up review of three screens, so the persona widgets have something to show in previews.
const SAMPLE_SCREENS = ["Portal home", "Article", "Create account"];
const personaSample = (): FlatRow[] => {
  const r = rng(11);
  const rows: FlatRow[] = [];
  SAMPLE_SCREENS.forEach((screen, s) => {
    const t = T0 + s * 60_000;
    const base = { screen, page: screen, file: `${screen.toLowerCase().replace(/ /g, "-")}.png`, upload_id: `sample-${s}` };
    const views = PERSONAS.map((p, i) => {
      const spread = s === 2 ? 0.35 : 0.12;
      const attention = Array.from({ length: 4 }, (_, k) => ({ label: ["Logo", "Search box", "Main heading", "Language links"][k], x: Math.min(1, Math.max(0, [0.5, 0.5, 0.3, 0.7][k] + (r() - 0.5) * spread * (i + 1))), y: Math.min(1, Math.max(0, [0.2, 0.42, 0.3, 0.7][k] + (r() - 0.5) * spread)), weight: 1 - k * 0.2 }));
      const clarity = Math.round(8 - s * 1.5 - (p.id === "low-vision" ? 2 : 0) + r());
      rows.push({ t, type: "persona_view", ...base, persona: p.id, persona_name: p.name, clarity, continue: clarity >= 6, quote: ["I know where to type.", "Lots of text, but the title is clear.", "Why do I need an account to read?"][s], purpose: ["Find an encyclopedia article", "Read about one topic", "Sign up to edit"][s], attention });
      if ((i + s) % 2 === 0) rows.push({ t, type: "persona_friction", ...base, persona: p.id, persona_name: p.name, label: ["Language links", "Small grey links", "Captcha"][s], issue: ["So many languages, I can't find mine quickly.", "Footnote links are tiny and low contrast.", "The captcha is hard to read."][s], severity: (["low", "medium", "high"] as const)[(s + i) % 3], x: 0.7 - i * 0.1, y: 0.6 + s * 0.1 });
      return { persona: p.id, clarity, continue: clarity >= 6, points: attention };
    });
    const { agreement, split } = agreementOf(views);
    rows.push({ t, type: "persona_agreement", ...base, agreement, clarity_avg: views.reduce((a, v) => a + v.clarity, 0) / views.length, continue_share: Math.round((views.filter((v) => v.continue).length / views.length) * 100), split_a: split?.a, split_b: split?.b });
  });
  return rows;
};

const bodyProgressW: WidgetManifestInput = {
  id: "body-progress",
  version: "1.0.0",
  name: "Body progress",
  summary: "How defined each area looks, day by day, with the change since day 1. Visual estimates only.",
  shape: "series",
  slots: [],
  settings: [{ key: "headline", label: "Headline area", kind: "select", options: [...BODY_REGIONS], default: "abs" }],
};

const bodyCompareW: WidgetManifestInput = {
  id: "body-compare",
  version: "1.0.0",
  name: "Day 1 vs today",
  summary: "The first and latest photo side by side, with what changed in each area.",
  shape: "table",
  slots: [],
  settings: [],
};

const checkinStreakW: WidgetManifestInput = {
  id: "checkin-streak",
  version: "1.0.0",
  name: "Check-in streak",
  summary: "Days logged on a calendar and the current run of days in a row.",
  shape: "number",
  slots: [],
  settings: [],
};

// Three weeks of made-up front-photo check-ins with a few skipped days, run through the same math as real ones.
const bodySample = (): FlatRow[] => {
  const r = rng(7);
  const checks: BodyCheck[] = [];
  for (let d = 0; d < 21; d++) {
    if (d === 5 || d === 6 || d === 13) continue;
    const day = new Date(T0 + d * 86_400_000).toISOString().slice(0, 10);
    const lift = d / 6;
    const s = (base: number) => Math.max(1, Math.min(10, Math.round(base + lift + (r() - 0.5))));
    checks.push({ day, t: T0 + d * 86_400_000, comparable: d !== 9, uploadId: `sample-${d}`, scores: { abs: s(3), chest: s(4), arms: s(4.5), shoulders: s(4), legs: null, back: null } });
  }
  return checks.map((c) => {
    const p = progressOf(checks.filter((x) => x.day <= c.day), c.day);
    return { t: c.t, type: "body_progress", ...p, upload_id: c.uploadId, lane: "Front photo", lane_id: "sample-front", summary: c.day === checks.at(-1)!.day ? "Upper abs a little more visible than day 1; light is similar." : "" };
  });
};

const withTimes = (n: number, step: number, make: (i: number) => Record<string, unknown>): FlatRow[] =>
  sampleTimes(n, step).map((t, i) => ({ t, type: "sample", ...make(i) }));

const entries: WidgetEntry[] = [
  { manifest: defineWidget(statTrend), Component: StatTrend, sample: (b) => { const w = wave(30, 6, 3); return withTimes(30, 10_000, (i) => ({ [b.value[0] ?? "count"]: w[i] })); } },
  {
    manifest: defineWidget(stackedShare),
    Component: StackedShare,
    sample: (b) => {
      const keys = b.parts.length ? b.parts : ["a", "b"];
      const w = wave(24, 3, 1.5);
      return withTimes(24, 10_000, (i) => Object.fromEntries(keys.map((k, j) => [k, j === 0 ? w[i] : Math.max(0, 5 - w[i] + ((i + j) % 3)) * (j === 2 ? 0.2 : 1) | 0])));
    },
  },
  {
    manifest: defineWidget(volumeBars),
    Component: VolumeBars,
    sample: () => wave(14, 5, 3).flatMap((n, d) => Array.from({ length: n }, () => ({ t: T0 + d * 86_400_000, type: "sample" }) as FlatRow)),
  },
  {
    manifest: defineWidget(categoryBars),
    Component: CategoryBars,
    sample: (b) => {
      const field = b.category[0] ?? "class";
      const mix = [["car", 9], ["truck", 4], ["person", 3], ["bus", 2], ["bike", 1]] as const;
      return mix.flatMap(([k, n]) => Array.from({ length: n }, (_, i) => ({ t: T0 + i * 1000, type: "sample", [field]: k }) as FlatRow));
    },
  },
  {
    manifest: defineWidget(detectionBoard),
    Component: DetectionBoard,
    sample: (b) => {
      const field = b.category[0] ?? "label";
      const said = { person: "Person walking left to right", bicycle: "Bicycle pushed along the pavement", dog: "Small dog on a lead" } as Record<string, string>;
      return withTimes(24, 2000, (i) => {
        const k = i % 7 === 0 ? "bicycle" : i % 11 === 0 ? "dog" : "person";
        return { [field]: k, at: `00:${String(Math.floor(i / 3) * 2).padStart(2, "0")}`, confidence: 0.82 + ((i * 7) % 15) / 100, description: said[k] };
      });
    },
  },
  {
    manifest: defineWidget(eventFeed),
    Component: EventFeed,
    sample: (b) => withTimes(3, 60_000, (i) => ({ [b.title[0] ?? "title"]: ["Wrong-way entry, ramp B", "Near-miss at crossing 14", "Hard braking cluster at Main St"][i] })),
  },
  {
    manifest: defineWidget(heatGrid),
    Component: HeatGrid,
    sample: (b) => {
      const r = rng(7);
      const [fx, fy] = [b.x[0] ?? "x", b.y[0] ?? "y"];
      return Array.from({ length: 220 }, (_, i) => {
        const hot = i % 3 === 0;
        const g = () => (r() + r() + r()) / 3;
        return { t: T0 + i * 1000, type: "sample", [fx]: hot ? 0.25 + g() * 0.2 : 0.62 + g() * 0.3, [fy]: hot ? 0.55 + g() * 0.3 : 0.2 + g() * 0.3 } as FlatRow;
      });
    },
  },
  { manifest: defineWidget(footprint), Component: Footprint, sample: footprintSample },
  {
    manifest: defineWidget(rowsTable),
    Component: RowsTable,
    sample: () => withTimes(4, 30_000, (i) => ({ label: ["car", "truck", "car", "bus"][i], confidence: [0.94, 0.88, 0.91, 0.79][i] })),
  },
  { manifest: defineWidget(perceptionMap), Component: PerceptionMap, sample: () => personaSample().filter((r) => r.type !== "persona_agreement") },
  { manifest: defineWidget(personaAgreementW), Component: PersonaAgreement, sample: () => personaSample().filter((r) => r.type === "persona_agreement") },
  { manifest: defineWidget(frictionLogW), Component: FrictionLog, sample: () => personaSample().filter((r) => r.type === "persona_friction") },
  { manifest: defineWidget(bodyProgressW), Component: BodyProgress, sample: bodySample },
  { manifest: defineWidget(bodyCompareW), Component: BodyCompare, sample: bodySample },
  { manifest: defineWidget(checkinStreakW), Component: CheckinStreak, sample: bodySample },
];

const byId = new Map(entries.map((e) => [e.manifest.id, e]));
if (byId.size !== entries.length) throw new Error("Duplicate widget id in the registry");

export const widgets: readonly WidgetEntry[] = entries;
export const getWidget = (id: string) => byId.get(id);
