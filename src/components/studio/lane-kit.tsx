"use client";

import { LaneBoard, type LaneActions, type LaneData, type LaneFile } from "./lane-board";
import { LaneDropList, StudioDropZone, type StudioLane } from "./lane-drop";

/** The Lanes window in every state for /design STU-06. Design fixtures only; the actions resolve locally. */

const PRODUCTS = [
  { id: "body-progress", name: "Body progress" },
  { id: "body-compare", name: "Day 1 vs today" },
  { id: "checkin-streak", name: "Check-in streak" },
  { id: "object-detection-dataset", name: "Object detection dataset" },
];

const file = (i: number, read: LaneFile["read"], rows = 2, name = `front-${i}.jpg`): LaneFile => ({ id: `f${i}`, filename: name, size: 820_000 + i * 9000, status: "ready", createdAt: `2026-10-${String(10 + i).padStart(2, "0")}T07:30:00Z`, takenOn: `2026-10-${String(10 + i).padStart(2, "0")}`, read, rows: read === "done" ? rows : 0 });

const LANES: LaneData[] = [
  { id: "front", name: "Front photo", note: "One front photo a day, same spot and light, shirt off.", analyzer: "body", input: "files", feeds: ["body-progress", "body-compare", "checkin-streak"], files: [file(7, "working"), file(6, "done"), file(5, "done"), file(4, "done"), file(3, "done"), file(2, "done"), file(1, "done")] },
  { id: "side", name: "Side photo", note: "Side view, arms relaxed, same distance as the front photo.", analyzer: "body", input: "files", feeds: ["body-progress"], files: [file(11, "done", 2, "side-1.jpg"), file(12, "failed", 0, "side-2.jpg")] },
  { id: "gym", name: "Gym floor clips", note: "Short clips of the gym floor at peak hours.", analyzer: "objects", input: "files", feeds: [], files: [] },
  { id: "desk", name: "Front desk screen", note: "The camera view of the front desk, shared from the laptop.", analyzer: "objects", input: "screen", ready: true, feeds: [], files: [] },
  { id: "weather", name: "Weather at the gym", note: "", analyzer: "objects", input: "weather", ready: false, feeds: [], files: [] },
];

/** Stand-in for a live lane's setup, which is rendered on the server (capture panel, forms, webhook line). */
const SETUP = {
  desk: <section className="grid gap-2 border p-4 text-sm"><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Last data 07:42Z</p><span className="justify-self-start bg-primary px-3 py-1.5 text-primary-foreground">Start capture</span><p className="text-xs text-muted-foreground">Frames are sampled in your browser every 10 s and read by the vision model.</p></section>,
  weather: <section className="grid gap-2 border p-4 text-sm"><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Needs setup before it runs</p><div className="flex gap-2"><span className="w-36 border px-2 py-1.5 text-muted-foreground">Latitude</span><span className="w-36 border px-2 py-1.5 text-muted-foreground">Longitude</span><span className="border px-3 py-1.5">Save</span></div></section>,
};

/** The Lanes window with fixture lanes, for the studio's setup windows on /design. */
export function LanesWindowPreview() {
  return <LaneBoard projectId="design" lanes={LANES} products={PRODUCTS} actions={ACTIONS} setup={SETUP} preview />;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ACTIONS: LaneActions = {
  suggest: async (words) => {
    await wait(1800);
    return { lane: { name: "Morning front photo", note: `Front photo taken each morning (${words}).`, analyzer: "body", feeds: ["body-progress", "body-compare"] }, problems: [] };
  },
  create: async () => ({}),
  setFeeds: async () => {},
  remove: async () => {},
};
const FAILS: LaneActions = { ...ACTIONS, suggest: async () => ({ error: "The model did not answer. Try again, or set the lane up yourself." }) };

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="max-h-[36rem] overflow-y-auto border p-5">{children}</div>
    </div>
  );
}

export function LaneStates() {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Frame title="Empty project · first lane, live (try it)"><LaneBoard projectId="design" lanes={[]} products={PRODUCTS} actions={ACTIONS} preview /></Frame>
      <Frame title="Lanes · one reading, one feeding nothing"><LaneBoard projectId="design" lanes={LANES} products={PRODUCTS} actions={ACTIONS} preview /></Frame>
      <Frame title="Lane open · its files"><LaneBoard projectId="design" lanes={LANES} products={PRODUCTS} actions={ACTIONS} preview start={{ open: "front" }} /></Frame>
      <Frame title="Lane open · empty, no product reads it"><LaneBoard projectId="design" lanes={LANES} products={PRODUCTS.slice(0, 3)} actions={ACTIONS} preview start={{ open: "gym" }} /></Frame>
      <Frame title="Live lane open · screen share"><LaneBoard projectId="design" lanes={LANES} products={PRODUCTS} actions={ACTIONS} setup={SETUP} preview start={{ open: "desk" }} /></Frame>
      <Frame title="Live lane open · weather, needs setup"><LaneBoard projectId="design" lanes={LANES} products={PRODUCTS} actions={ACTIONS} setup={SETUP} preview start={{ open: "weather" }} /></Frame>
      <Frame title="Suggestion to check · a live input"><LaneBoard projectId="design" lanes={LANES.slice(0, 1)} products={PRODUCTS} actions={ACTIONS} preview start={{ phase: { at: "draft", ai: true, lane: { name: "Front desk screen", note: "The front desk camera, shared from the laptop.", input: "screen", analyzer: "objects", feeds: [] } } }} /></Frame>
      <Frame title="Suggesting"><LaneBoard projectId="design" lanes={LANES.slice(0, 1)} products={PRODUCTS} actions={ACTIONS} preview start={{ phase: { at: "thinking", words: "side pics too" } }} /></Frame>
      <Frame title="Suggestion to check"><LaneBoard projectId="design" lanes={LANES.slice(0, 1)} products={PRODUCTS} actions={ACTIONS} preview start={{ phase: { at: "draft", ai: true, lane: { name: "Side photo", note: "Side view each morning, arms relaxed.", analyzer: "body", feeds: ["body-progress", "body-compare"] } } }} /></Frame>
      <Frame title="Code check blocks it"><LaneBoard projectId="design" lanes={LANES.slice(0, 1)} products={PRODUCTS} actions={ACTIONS} preview start={{ phase: { at: "draft", ai: false, lane: { name: "Front photo", note: "", analyzer: "body", feeds: [] } } }} /></Frame>
      <Frame title="Model failed"><LaneBoard projectId="design" lanes={LANES.slice(0, 1)} products={PRODUCTS} actions={FAILS} preview start={{ phase: { at: "writing", words: "food pics", error: "The model did not answer. Try again, or set the lane up yourself." } }} /></Frame>
    </div>
  );
}

const DOCK: StudioLane[] = [
  { id: "front", name: "Front photo", analyzer: "body", input: "files", files: 7, reading: 1 },
  { id: "side", name: "Side photo", analyzer: "body", input: "files", files: 2, reading: 0 },
  { id: "gym", name: "Gym floor clips", analyzer: "objects", input: "files", files: 0, reading: 0 },
  { id: "desk", name: "Front desk screen", analyzer: "objects", input: "screen", files: 0, reading: 0, live: { ready: true, last: "07:42" } },
  { id: "weather", name: "Weather at the gym", analyzer: "objects", input: "weather", files: 0, reading: 0, live: { ready: false } },
];

function DockFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="w-64 border bg-background">{children}</div>
    </div>
  );
}

/** Dropping files on a lane in the studio itself: the dock rows and the overlay, for /design STU-07. */
export function LaneDropStates() {
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap gap-4">
        <DockFrame title="Dock · lanes, live (drop a photo on one)"><LaneDropList lanes={DOCK} preview={{ drops: {} }} /></DockFrame>
        <DockFrame title="Dock · dragging over a lane"><LaneDropList lanes={DOCK} preview={{ drops: {}, over: "side" }} /></DockFrame>
        <DockFrame title="Dock · uploading, sampling, refused">
          <LaneDropList lanes={DOCK} preview={{ drops: {
            front: { name: "front-8.jpg", pct: 64, left: 2 },
            gym: { name: "peak.mp4", pct: 30, step: "Sampling frames in your browser · 12/40", left: 0 },
            side: { name: "", pct: 0, left: 0, error: "This lane takes one photo a day; skipped 1 file." },
          } }} />
        </DockFrame>
        <DockFrame title="Dock · no lanes yet"><LaneDropList lanes={[]} /></DockFrame>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div>
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Overlay · files dragged over the studio, over Side photo</p>
          <div className="border"><StudioDropZone lanes={DOCK} preview={{ over: "side" }} /></div>
        </div>
        <div>
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Overlay · no lanes yet</p>
          <div className="border"><StudioDropZone lanes={[]} preview={{}} /></div>
        </div>
      </div>
    </div>
  );
}
