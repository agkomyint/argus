"use client";

import Link from "next/link";
import { useState } from "react";
import { Surface } from "@/components/design/surface";
import { MASKED_MEDIA, NAMED_MEDIA, PUBLIC_PRODUCTS, PUBLIC_PROJECT, PUBLIC_REPLAY, PUBLIC_TIMELINE, PUBLIC_TIMELINE_BUSY, PUBLIC_VIEW } from "@/components/explore/public-samples";
import { productSteps } from "@/components/explore/product-lane";
import { PublicStudio } from "@/components/explore/public-studio";
import { OwnerBar } from "./owner-bar";
import { ProductPicker, type ProductChoice } from "./product-picker";
import { StudioSkeleton, WindowLoading } from "./studio-skeleton";
import { AgentConnect } from "./agent-connect";
import { Observatory, type TraceStep } from "./observatory";
import { sampleVideo, type SampleReport } from "@/sources/browser-video";
import { StudioWindow, type StudioWindowId } from "./studio-window";
import { LaneDropStates, LanesWindowPreview, LaneStates } from "./lane-kit";
import { fedMap, StudioTimelineView, type TimelineMode } from "./studio-timeline";
import { ProductRail } from "./product-rail";
import { ScenePreview } from "./lane-story";
import { EMPTY_TIMELINE, type StudioTimeline, type TlItem } from "@/lib/studio-timeline-types";
import { useReplayClock } from "@/lib/replay-clock";

const SAMPLE_CHOICES: ProductChoice[] = [
  { id: "object-detection-dataset", name: "Object detection dataset", summary: "Every object the vision model found, with its kind, confidence and the frame it came from.", level: "L2", on: true, ready: 40, needs: ["files"], from: [] },
  { id: "people-count", name: "People count", summary: "How many people are in view over time.", level: "L3", on: true, ready: 12, needs: ["files", "screen share"], from: [] },
  { id: "density-heatmap", name: "Density heatmap", summary: "Where objects gather in the frame.", level: "L3", on: false, ready: 40, needs: ["files"], from: [], locates: true },
  { id: "dwell-time", name: "Dwell time", summary: "How long people stay in view.", level: "L4", on: false, ready: 0, needs: ["screen share"], from: [] },
  { id: "footfall-report", name: "Footfall report", summary: "Daily totals and peaks, computed from people count.", level: "L5", on: false, ready: 0, needs: [], from: ["People count"] },
];

/** The Products window with sample choices; toggles change local state only. */
export function ProductsWindowPreview({ state = "some" }: { state?: "some" | "none" | "error" }) {
  const [items, setItems] = useState(() => SAMPLE_CHOICES.map((p) => ({ ...p, on: state === "some" && p.on })));
  return (
    <ProductPicker
      items={items}
      onToggle={async (id, on) => {
        await new Promise((r) => setTimeout(r, 400));
        if (state === "error") return { error: "Project not found" };
        setItems((cur) => cur.map((p) => (p.id === id ? { ...p, on } : p)));
        return {};
      }}
    />
  );
}

const SAMPLE_DAY = new Date("2026-10-20T09:00:00Z");
const noop = async () => {};

/** The Agents window with sample agents and keys. Making a key here returns a fake one; nothing is saved. */
export function AgentsWindowPreview({ empty = false }: { empty?: boolean }) {
  return (
    <AgentConnect
      mcpUrl="https://argus.example/api/mcp"
      agents={empty ? [] : [{ clientId: "c1", name: "Claude Code", canWrite: true, since: SAMPLE_DAY }, { clientId: "c2", name: "Muse notebook", canWrite: false, since: SAMPLE_DAY }]}
      keys={empty ? [] : [{ id: "k1", name: "Muse on my laptop", prefix: "argus_sk_3fQa", createdAt: SAMPLE_DAY, lastUsedAt: null }]}
      onDisconnect={noop}
      onRevoke={noop}
      makeKey={async () => "argus_sk_sample-key-not-real"}
    />
  );
}
// One sampled video frame going through the pipeline, then an Ask ARGUS lookup. Sample data, nothing ran.
const at = (s: number) => new Date(Date.UTC(2026, 9, 20, 9, 14, s));
const SAMPLE_STEPS: TraceStep[] = [
  { id: "t7", at: at(41), kind: "tool", name: "ask.describeProduct", model: null, status: "ok", ms: 38, tokensIn: null, tokensOut: null, input: { product: "people-count" }, output: { product: "People count", datasets: [{ rows: 30, max: 14, mean: 6.2 }] }, error: null, observations: 0, subject: "Ask ARGUS" },
  { id: "t6", at: at(40), kind: "model", name: "ask.reply", model: "muse-spark-1.3", status: "ok", ms: 1840, tokensIn: 2310, tokensOut: 96, input: { question: "How busy was the lobby?", scope: ["Lobby"] }, output: [{ calls: "describeProduct", with: { product: "people-count" } }], error: null, observations: 0, subject: "Ask ARGUS" },
  { id: "t5", at: at(12), kind: "code", name: "observations.write", model: null, status: "ok", ms: 21, tokensIn: null, tokensOut: null, input: { at: "00:42", people: 6, findings: 2 }, output: { written: 3 }, error: null, observations: 3, subject: "lobby.mp4" },
  { id: "t4", at: at(11), kind: "model", name: "perception.image", model: "muse-spark-1.3", status: "ok", ms: 2730, tokensIn: 1210, tokensOut: 88, input: { context: "This is the frame at 00:42 of the video \"lobby.mp4\".", mediaType: "image/jpeg", image: { bytes: 61204 } }, output: [{ label: "person", kind: "object", confidence: 0.91 }, { label: "trolley", kind: "object", confidence: 0.64 }], error: null, observations: 0, subject: "lobby.mp4" },
  { id: "t3", at: at(8), kind: "model", name: "perception.scene", model: "muse-spark-1.3", status: "error", ms: 30012, tokensIn: null, tokensOut: null, input: { wantAttributes: false, image: { bytes: 61204 } }, output: null, error: "Request timed out after 30 s; the job retries it", observations: 0, subject: "lobby.mp4" },
  { id: "t2", at: at(3), kind: "code", name: "video.store_frame", model: null, status: "ok", ms: 14, tokensIn: null, tokensOut: null, input: { file: "lobby.mp4", at: "00:42", image: { bytes: 61204 } }, output: { frame: "frames/…/000042000.jpg" }, error: null, observations: 1, subject: "lobby.mp4" },
  { id: "t1", at: at(0), kind: "code", name: "video.sample_frames", model: null, status: "ok", ms: 4120, tokensIn: null, tokensOut: null, input: { durationMs: 60000, everyMs: 2000, decoder: "HTMLVideoElement + canvas (browser)" }, output: { frames: 30, ranIn: "the uploader's browser" }, error: null, observations: 0, subject: "lobby.mp4" },
];

export function ObservatoryPreview({ state = "full" }: { state?: "full" | "empty" | "error" }) {
  return <Observatory refreshable={false} steps={state === "full" ? SAMPLE_STEPS : []} error={state === "error" ? "the trace log is not available right now" : undefined} />;
}

/** Runs the real browser sampler on a local clip and shows its frames. Nothing is uploaded. */
function VideoSamplerDemo() {
  const [frames, setFrames] = useState<{ atMs: number; url: string }[]>([]);
  const [report, setReport] = useState<SampleReport | null>(null);
  const [error, setError] = useState("");
  async function run(file: File) {
    setFrames([]);
    setReport(null);
    setError("");
    try {
      setReport(await sampleVideo(file, async ({ atMs, jpeg }) => setFrames((f) => [...f, { atMs, url: URL.createObjectURL(jpeg) }])));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sample");
    }
  }
  return (
    <div className="max-w-4xl border p-5 text-sm">
      <p className="mb-2 text-muted-foreground">Pick a video: your browser decodes it and samples the frames the models would see. No ffmpeg, no upload.</p>
      <input type="file" accept="video/*" data-testid="sampler-input" onChange={(e) => e.target.files?.[0] && void run(e.target.files[0])} />
      {error && <p role="alert" className="mt-2 text-destructive">{error}</p>}
      {report && <p data-testid="sampler-report" className="mt-2 font-mono text-xs text-muted-foreground">{report.frames} frames · every {report.everyMs / 1000} s · {report.width}×{report.height} · {report.ms} ms · {report.decoder}</p>}
      {frames.length > 0 && (
        <ol className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {frames.map((f) => (
            <li key={f.atMs} className="border">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URLs */}
              <img src={f.url} alt={`Frame at ${f.atMs / 1000} s`} className="aspect-video w-full object-cover" />
              <span className="block px-1 font-mono text-[10px] text-muted-foreground">{(f.atMs / 1000).toFixed(0)} s</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const previewWindows = { lanes: <LanesWindowPreview />, products: <ProductsWindowPreview />, observatory: <ObservatoryPreview />, agents: <AgentsWindowPreview /> };

const frame = "h-[760px] overflow-hidden border";
const note = "mt-2 font-mono text-[11px] text-muted-foreground";
const bar = (empty = false) => (
  <OwnerBar project={{ id: "design", name: empty ? "Empty study" : PUBLIC_PROJECT.name, slug: null, media: false }} windows={previewWindows} open={null} key={String(empty)} />
);

/** The studio surfaces on /design: the owner's studio with data, empty and loading, then its windows. */
export function StudioKit() {
  const [win, setWin] = useState<StudioWindowId | "agents-empty" | "products-none" | "products-error" | null>(null);

  return (
    <>
      <Surface code="STU-01" name="ARGUS Studio" used="/studio/[id], one studio per project">
        <div className={frame}>
          <PublicStudio project={PUBLIC_PROJECT} replay={PUBLIC_REPLAY} products={PUBLIC_PRODUCTS} view={PUBLIC_VIEW} timeline={PUBLIC_TIMELINE} owner={{ bar: bar(), exportBase: "#" }} className="h-full" />
        </div>
        <p className={note}>
          Design fixture (a made-up bus stop study), shown only here. On /studio/[id] every dock reads the project’s own sources, Observations, model calls and media, opens on the latest moment and refreshes while jobs run. <Link href="/design/studio" className="text-electric hover:underline">Open it full screen</Link>.
        </p>
      </Surface>

      <Surface code="STU-02" name="Studio, empty and loading" used="a new project with no lane yet (the Lanes window opens on arrival), while a project loads, and a window whose contents are still loading">
        <div className="grid gap-4">
          <div className="h-[420px] overflow-hidden border">
            <PublicStudio project={{ ...PUBLIC_PROJECT, name: "Empty study" }} replay={null} products={[]} view={{ media: [], producers: {}, samples: {} }} owner={{ bar: bar(true), exportBase: "#" }} className="h-full" />
          </div>
          <div className="h-[420px] overflow-hidden border"><StudioSkeleton /></div>
          <div className="max-w-md border bg-card"><WindowLoading label="lanes" /></div>
        </div>
      </Surface>

      <Surface code="STU-03" name="Setup windows" used="/studio/[id]: Lanes, Products, Observatory and Agents in the menu bar, and the + buttons in the Sources dock and scene bar">
        <p className="mb-3 max-w-2xl text-sm text-muted-foreground">Setup never leaves the studio. It opens in a window over it, like OBS settings, and the stream keeps running behind. On /studio/[id] Lanes holds every input: file lanes with their files, live lanes with their capture, feed or webhook setup; Products adds or removes data products, with how many records each already has; Agents connects Claude Code or any MCP client and holds API keys.</p>
        <div className="flex flex-wrap gap-2">
          {([["lanes", "Open the Lanes window"], ["products", "Products"], ["products-none", "Products, none added"], ["products-error", "Products, save fails"], ["agents", "Open the Agents window"], ["agents-empty", "Agents, nothing connected"]] as const).map(([id, text]) => (
            <button key={id} type="button" onClick={() => setWin(id)} className="border px-3 py-1.5 text-sm hover:border-electric hover:text-electric">{text}</button>
          ))}
        </div>
        <StudioWindow id="lanes" open={win === "lanes"} onOpenChange={(o) => setWin(o ? "lanes" : null)}><LanesWindowPreview /></StudioWindow>
        <StudioWindow id="products" open={win === "products"} onOpenChange={(o) => setWin(o ? "products" : null)}><ProductsWindowPreview /></StudioWindow>
        <StudioWindow id="products" open={win === "products-none"} onOpenChange={(o) => setWin(o ? "products-none" : null)}><ProductsWindowPreview state="none" /></StudioWindow>
        <StudioWindow id="products" open={win === "products-error"} onOpenChange={(o) => setWin(o ? "products-error" : null)}><ProductsWindowPreview state="error" /></StudioWindow>
        <StudioWindow id="agents" open={win === "agents"} onOpenChange={(o) => setWin(o ? "agents" : null)}><AgentsWindowPreview /></StudioWindow>
        <StudioWindow id="agents" open={win === "agents-empty"} onOpenChange={(o) => setWin(o ? "agents-empty" : null)}><AgentsWindowPreview empty /></StudioWindow>
      </Surface>

      <Surface code="STU-06" name="Lanes window" used="/studio/[id]: Lanes in the menu bar, the Sources dock's + Lane, and on arrival in a project with nothing connected">
        <p className="mb-3 max-w-2xl text-sm text-muted-foreground">Everything comes in through a lane, and the lane comes first: files, a screen share, a weather feed, a sensor or a webhook. The person says what goes in it; the model (lanes.suggest_one) names it, picks its input, the analyzer and the products it feeds; code (lanes.check_one) drops any feed that cannot read it. A files lane takes drops and shows whether each file has been read and how many rows it wrote; a live lane shows its setup and when data last came in. The window refreshes itself while anything is reading.</p>
        <LaneStates />
      </Surface>

      <Surface code="STU-07" name="Drop files into lanes" used="/studio/[id]: the lanes at the top of the Sources dock, and the overlay that covers the studio while files are dragged in">
        <p className="mb-3 max-w-2xl text-sm text-muted-foreground">No window needed to add files. Drag files anywhere onto the studio and every lane shows as a tile; let go on one and the files upload there, one after another. Each lane row in the Sources dock also takes drops and has its own add button, and shows the progress wherever the drop happened. A lane turns away files its analyzer cannot read. Several photos dropped on a check-in lane each go on their file&rsquo;s own day.</p>
        <LaneDropStates />
      </Surface>

      <Surface code="STU-08" name="Data products rail" used="/studio/[id] and /explore/[slug]: the right of the studio">
        <p className="mb-3 max-w-2xl text-sm text-muted-foreground">One live card per data product: its colour along the top, the count at the playhead running up to each new value with a short +n as records land, and a filled line of how it grew. Click a card to open its chart; any number stay open, and the last one clicked is the one the preview follows. Drag a chart&rsquo;s bottom edge to make it taller, and in the studio the rail&rsquo;s left edge to make it wider; both are kept per viewer and a double-click resets them.</p>
        <RailStates />
      </Surface>

      <Surface code="STU-09" name="Preview with SAM outlines" used="/studio/[id] and /explore/[slug]: the middle of the studio, and the photo viewer on a replay">
        <p className="mb-3 max-w-2xl text-sm text-muted-foreground">Muse Spark names what is in a picture; when a product reads positions (Object footprint, Density heatmap), SAM 3.1 outlines every instance and code measures it. The outlines are drawn over the picture in the frame SAM saw, so they stay on their objects at any size. Without such a product only the names show. A private lane shows neither.</p>
        <div className="grid max-w-5xl gap-4 md:grid-cols-3">
          {([["Outlined by SAM", MASKED_MEDIA, false], ["Named only", NAMED_MEDIA, false], ["Media kept private", MASKED_MEDIA, true]] as const).map(([title, media, hidden]) => (
            <div key={title}>
              <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{title}</p>
              <div className="h-72 border"><ScenePreview media={media} item={null} lane={null} hidden={hidden} onOpen={() => {}} className="h-full" /></div>
            </div>
          ))}
        </div>
      </Surface>

      <Surface code="STU-05" name="Studio timeline" used="/studio/[id] and /explore/[slug]: along the bottom of the studio">
        <p className="mb-3 max-w-2xl text-sm text-muted-foreground">How each lane was read by the AI and what came out. Simple: one row per lane, a dot per file (hollow while it waits, filled once the AI read it, a cross if it failed; live lanes are bars), and a row of product updates. Lane steps opens each lane into in, AI read, checked and out. Everything shows every recorded step by kind and each product&rsquo;s line. Click a dot to follow that file; the mode is remembered per viewer, and /explore opens on Lane steps.</p>
        <TimelineStates />
      </Surface>

      <Surface code="STU-04" name="Observatory" used="/studio/[id]: Observatory in the menu. Fed by src/lib/trace.ts">
        <p className="mb-3 max-w-2xl text-sm text-muted-foreground">Every model call, code step and tool call is recorded and shown here. Click a step for what went in and what came out. Below: a sampled video frame through the models, one failed call, and an Ask ARGUS lookup.</p>
        <div className="max-w-4xl border p-5"><ObservatoryPreview /></div>
        <div className="mt-4 grid max-w-4xl gap-4 md:grid-cols-2">
          <div className="border p-5"><ObservatoryPreview state="empty" /></div>
          <div className="border p-5"><ObservatoryPreview state="error" /></div>
        </div>
        <p className="mt-6 mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Video source · browser sampler</p>
        <VideoSamplerDemo />
      </Surface>
    </>
  );
}

const STEPS = productSteps(PUBLIC_PRODUCTS, PUBLIC_REPLAY.start, PUBLIC_REPLAY.end - PUBLIC_REPLAY.start);

/** One timeline on the sample study, with its own clock and mode. */
function TimelineDemo({ title, tl = PUBLIC_TIMELINE, mode = "simple", at, pick, autoplay, collapsed }: {
  title: string; tl?: StudioTimeline; mode?: TimelineMode; at?: number; pick?: string; autoplay?: boolean; collapsed?: boolean;
}) {
  const clock = useReplayClock(PUBLIC_REPLAY, { start: at, autoplay });
  const [selected, setSelected] = useState<string | null>(pick ?? null);
  const [active, setActive] = useState(PUBLIC_PRODUCTS[0].id);
  const fed = fedMap(PUBLIC_PRODUCTS, STEPS, tl.lanes.flatMap((l) => l.items));
  return (
    <div>
      <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="@container border">
        <StudioTimelineView tl={tl} start={PUBLIC_REPLAY.start} end={PUBLIC_REPLAY.end} clock={clock} products={STEPS} fedOf={(id) => fed.get(id) ?? []}
          selected={selected} onSelect={(i: TlItem) => { setSelected(i.id); clock.seek(i.done); }} activeProduct={active} onProduct={setActive}
          defaultMode={mode} own collapsed={collapsed} className="border-t-0" />
      </div>
    </div>
  );
}

/** The products rail at a few moments: part way with one chart open, all open with a picked file, before anything, and with none. */
function RailStates() {
  const { start, end } = PUBLIC_REPLAY;
  const mid = start + 135 * 60_000;
  const ids = PUBLIC_PRODUCTS.map((p) => p.id);
  const fed = fedMap(PUBLIC_PRODUCTS, STEPS, PUBLIC_TIMELINE.lanes.flatMap((l) => l.items));
  const picked = PUBLIC_TIMELINE.lanes.flatMap((l) => l.items).find((i) => fed.has(i.id));
  const cases: [string, React.ReactNode][] = [
    ["Part way · one open", <ProductRail key="a" products={PUBLIC_PRODUCTS} steps={STEPS} tq={mid} active={ids[0]} onSelect={() => {}} exportBase="#" className="h-full" />],
    ["The end · all open · a file picked", <ProductRail key="b" products={PUBLIC_PRODUCTS} steps={STEPS} tq={end} active={ids[0]} startOpen={ids} onSelect={() => {}} fed={picked ? fed.get(picked.id) : undefined} from={picked?.label} exportBase="#" className="h-full" />],
    ["Before anything came in", <ProductRail key="c" products={PUBLIC_PRODUCTS} steps={STEPS} tq={start - 1} active={ids[0]} onSelect={() => {}} exportBase="#" className="h-full" />],
    ["Owner, no products yet", <ProductRail key="d" products={[]} steps={[]} tq={end} onSelect={() => {}} edit exportBase="#" className="h-full" />],
  ];
  return (
    <div className="grid max-w-6xl gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cases.map(([title, rail]) => (
        <div key={title}>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{title}</p>
          <div className="@container h-[620px] overflow-hidden border">{rail}</div>
        </div>
      ))}
    </div>
  );
}

/** The timeline in each mode and state. */
function TimelineStates() {
  const { start, end } = PUBLIC_REPLAY;
  return (
    <div className="grid max-w-6xl gap-5">
      <TimelineDemo title="Simple · the default" at={start + (end - start) * 0.6} />
      <TimelineDemo title="Lane steps · in, AI read, checked, out" mode="steps" at={start + (end - start) * 0.6} />
      <TimelineDemo title="Everything · every step by kind, and each product's line" mode="everything" at={end} />
      <TimelineDemo title="A file picked · its chain is marked, and what it fed" mode="steps" pick="u2" at={start + 74 * 60_000} />
      <TimelineDemo title="Still reading · one file being read, two waiting" tl={PUBLIC_TIMELINE_BUSY} at={end} />
      <TimelineDemo title="Playing · dots fill as the AI reads them" autoplay at={start} />
      <TimelineDemo title="Collapsed to a strip" collapsed at={end} />
      <TimelineDemo title="Empty" tl={EMPTY_TIMELINE} at={end} />
    </div>
  );
}
