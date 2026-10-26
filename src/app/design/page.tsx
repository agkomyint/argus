import { Check, CloudSun, FolderOpen, Monitor, Plus, Radio, Webhook } from "lucide-react";
import type { Metadata } from "next";
import { AgentBadge, AgentCard, STATES, StateBadge, TraceRow, kindRule, stateHint, type AgentKind } from "@/components/design/agent-kit";
import { EngineMap, type EngineEdge, type EngineNode } from "@/components/design/engine-map";
import { OpinionCard, PanelTally, SimulatedTag, type Opinion } from "@/components/design/opinion-kit";
import { AgentPicker, LIBRARY, LibraryCard, NewAgentTile, TYPES, TypeChip, TypedChain, type DataType } from "@/components/design/agent-library";
import { NewProjectSlide, NewProjectSteps, ProjectSlide, SlideNav, SourcePopover, type Slide } from "@/components/design/project-kit";
import { REPLAY_EMPTY, REPLAY_SAMPLE } from "@/components/design/replay-sample";
import { TunePanel } from "@/components/design/tune-kit";
import { ReplayPlayer } from "@/components/dashboard/replay-player";
import { ShareProjectDialog } from "@/components/dashboard/share-project-dialog";
import { SharedCard } from "@/components/landing/explore-teaser";
import { SourcePipeline, Sparkline, Thumbs, TimeRuler, Track } from "@/components/design/source-kit";
import { Group, Surface, Swatch, surfaceId } from "@/components/design/surface";
import { Logo } from "@/components/landing/logo";
import { ProductPreview } from "@/components/widgets/product-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty } from "@/components/widgets/empty";
import { products } from "@/products";
import { widgets } from "@/widgets/registry";
import { widgetFor } from "@/widgets/resolve";
import { WidgetView } from "@/widgets/use";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Design system — ARGUS" };

const ENGINE_NODES: EngineNode[] = [
  { id: "s1", col: 0, label: "Screen share", sub: "Pilot study / Lane 1", kind: "source", state: "working", rate: "2 frames / s" },
  { id: "s2", col: 0, label: "Portrait photos", sub: "Pilot study / Lane 2", kind: "source", state: "done", rate: "48 files" },
  { id: "s3", col: 0, label: "Weather feed", sub: "Site / Lane 1", kind: "source", state: "waiting", rate: "every 15 min" },
  { id: "a1", col: 1, label: "Perception", sub: "Finds people in a frame", kind: "model", state: "working", rate: "1.2 s / frame" },
  { id: "a2", col: 1, label: "Classify", sub: "Appears female / male", kind: "model", state: "paused", rate: "held by you" },
  { id: "o1", col: 3, label: "Panel opinion", sub: "3 stand-in people", kind: "opinion", state: "waiting", rate: "simulated" },
  { id: "a3", col: 1, label: "Normalize", sub: "Clean times and units", kind: "code", state: "done", rate: "4 ms" },
  { id: "f1", col: 2, label: "Correlation", sub: "Match by time window", kind: "code", state: "waiting", rate: "needs 2 inputs" },
  { id: "l1", col: 3, label: "People layer", sub: "Counts over time", kind: "code", state: "working", rate: "312 rows" },
  { id: "l2", col: 3, label: "Attribute layer", sub: "Share per group", kind: "code", state: "error", rate: "Failed at 14:02" },
  { id: "p1", col: 4, label: "People count", sub: "Stat and trend", kind: "product", state: "working" },
  { id: "p2", col: 4, label: "Attribute breakdown", sub: "Stacked share", kind: "product", state: "error" },
  { id: "p3", col: 4, label: "Density heatmap", sub: "Heat grid", kind: "product", state: "waiting" },
];
const ENGINE_EDGES: EngineEdge[] = [
  ["s1", "a1"], ["s2", "a1"], ["s2", "a2"], ["s3", "a3"], ["a1", "a2"], ["a1", "f1"], ["a3", "f1"],
  ["f1", "l1"], ["a2", "l2"], ["l1", "o1"], ["l1", "p1"], ["l1", "p3"], ["l2", "p2"],
];

const SLIDES: Slide[] = [
  { name: "Harbor Bridge monitoring", area: "Infrastructure", productIds: ["people-count", "density-heatmap"], sources: [{ name: "Screen share", state: "working" }, { name: "Weather feed", state: "done" }].map((x) => ({ ...x, note: "" })) as Slide["sources"], level: "Balanced", cost: "$32/h" },
  { name: "Bus stop study", area: "Transportation", productIds: ["people-count"], sources: [], level: "Balanced", cost: "$32/h" },
];

const SHARED = [
  { slug: "sample-a", name: "Harbor Bridge monitoring", kind: "bridge", owner: "Maya", sharedAt: new Date(Date.UTC(2026, 9, 26)), products: ["People count", "Apparent attribute breakdown", "Object detection dataset", "Defect log"], rows: 4210 },
  { slug: "sample-b", name: "Bus stop study", kind: "general", owner: "Sam", sharedAt: new Date(Date.UTC(2026, 9, 24)), products: ["People count"], rows: 0 },
];

const PANEL: Opinion[] = [
  { persona: { name: "Mia, commuter", role: "Rides the bus to work daily", traits: ["Time-poor", "Safety-minded"], basis: "Bus-rider survey notes, 2025" }, stance: "for", confidence: 0.78, said: "A live count at the stop would tell me whether to wait or walk.", because: "Counts peak at 08:10 and drop by 08:40." },
  { persona: { name: "Dr. Okafor, planner", role: "City transport planner", traits: ["Skeptical", "Data-first"], basis: "Planning brief and public reports" }, stance: "against", confidence: 0.64, said: "One camera is not a sample. I would not size a route on this.", because: "Only one site and 3 days of data." },
  { persona: { name: "Sam, shop owner", role: "Runs a store by the stop", traits: ["Cost-aware"], basis: "Small-business interview notes" }, stance: "unsure", confidence: 0.41, said: "Useful if it tells me when people pass, not just how many.", because: "Counts have no time-of-day split yet." },
];

const SURFACES: { group: string; items: [string, string][] }[] = [
  { group: "Frame", items: [["NAV-01", "Top bar"], ["NAV-02", "Sidebar"], ["HDR-01", "Page header"]] },
  { group: "0 · Projects", items: [["PRJ-01", "Project slide"], ["PRJ-02", "Project carousel"], ["PRJ-03", "New project"], ["PRJ-04", "Add a source"], ["PRJ-05", "Share publicly"]] },
  { group: "1 · Products", items: [["PRD-01", "Product card"], ["PRD-02", "Product page widget"], ["PRD-03", "Product setup bar"], ["DLG-01", "Add-product dialog"]] },
  { group: "Widgets", items: widgets.map((w, i) => [`WID-${String(i + 1).padStart(2, "0")}`, w.manifest.name] as [string, string]) },
  { group: "2 · Sources", items: [["SRC-01", "Source option"], ["SRC-02", "Source status chip"], ["SRC-04", "Source timeline"]] },
  { group: "3 · Agents", items: [["AGT-01", "Agent card"], ["AGT-10", "Agent library"], ["AGT-11", "Pipeline editor"], ["AGT-02", "Agent states"], ["AGT-09", "Opinion agent"]] },
  { group: "4 · Tune", items: [["AGT-05", "Cost and accuracy"], ["AGT-04", "Confidence lanes"]] },
  { group: "5 · Engine", items: [["FLW-02", "Engine map"], ["FLW-03", "Replay"], ["SRC-06", "Source pipeline"], ["AGT-06", "Agent trace"]] },
  { group: "Explore", items: [["EXP-01", "Shared project card"]] },
  { group: "States", items: [["STA-01", "Empty state"], ["STA-02", "Badges & buttons"]] },
];

const KIND_SWATCH = [
  ["--electric", "var(--electric)", "Primary action, selection, links"],
  ["--signal", "var(--signal)", "Live, healthy, linked"],
  ["--destructive", "var(--destructive)", "Alerts, delete"],
  ["--background", "var(--background)", "Page"],
  ["--muted", "var(--muted)", "Quiet fill, tracks"],
  ["--border", "var(--border)", "Every divider"],
  ["--foreground", "var(--foreground)", "Text"],
  ["--muted-foreground", "var(--muted-foreground)", "Secondary text, labels"],
  ["--chart-3", "var(--chart-3)", "Third series"],
  ["--chart-4", "var(--chart-4)", "Fourth series"],
] as const;

const SOURCES = [
  { name: "Files", blurb: "Photos, video, CSV and more, kept in a named timeline with lanes", icon: FolderOpen, state: "Suggested" },
  { name: "Screen share", blurb: "Live capture of a screen or camera view", icon: Monitor, state: "" },
  { name: "Weather feed", blurb: "Open-Meteo, by location", icon: CloudSun, state: "Added" },
  { name: "Sensor", blurb: "Simulated vibration sensor", icon: Radio, state: "" },
  { name: "Webhook", blurb: "Push JSON from your own system", icon: Webhook, state: "" },
];

export default function DesignPage() {
  const sample = products.find((p) => p.id === "people-count")!;
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur sm:px-8">
        <Logo />
        <span className="h-5 w-px bg-border" aria-hidden />
        <span className="text-sm font-medium">Design system</span>
        <span className="ml-auto hidden font-mono text-[11px] text-muted-foreground sm:block">Name a surface by its code, for example “make PRD-01 wider”.</span>
      </header>

      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-8 sm:px-8 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="Surfaces" className="hidden lg:block">
          <div className="sticky top-24 space-y-5 text-sm">
            <a href="#foundations" className="block font-medium hover:text-electric">Foundations</a>
            {SURFACES.map((g) => (
              <div key={g.group}>
                <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{g.group}</p>
                <ul>
                  {g.items.map(([code, name]) => (
                    <li key={code}><a href={`#${surfaceId(code)}`} className="flex gap-2 py-0.5 text-muted-foreground hover:text-foreground"><span className="w-14 shrink-0 font-mono text-[11px]">{code}</span>{name}</a></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <main className="min-w-0">
          <h1 className="text-3xl font-medium tracking-tight">ARGUS design system</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            A user picks the data product they want, adds the sources it needs, sees the agents working on it, tunes cost against accuracy, and watches the whole engine run. Every surface below serves one of those five steps.
          </p>

          <ol className="mt-6 grid gap-px border bg-border sm:grid-cols-5">
            {[["1", "Choose a product", "products"], ["2", "Add its sources", "sources"], ["3", "See the agents", "agents"], ["4", "Tune cost and accuracy", "tune"], ["5", "Watch the engine", "engine"]].map(([n, t, id]) => (
              <li key={id}><a href={"#" + id} className="flex h-full items-center gap-3 bg-background p-3 text-sm hover:bg-accent/40"><span className="font-mono text-xs text-electric">{n}</span>{t}</a></li>
            ))}
          </ol>

          <Group id="foundations" title="Foundations" blurb="Flat and square. Borders, not shadows. Mono caps for labels, sans for everything you read. Electric blue acts, signal green means live.">
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {KIND_SWATCH.map(([n, v, note]) => <Swatch key={n} name={n} value={v} note={note} />)}
            </ul>
            <div className="mt-6 grid gap-px border bg-border sm:grid-cols-3">
              <div className="bg-background p-4"><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Heading · IBM Plex Sans 500</p><p className="mt-2 text-2xl font-medium">Traffic by hour</p></div>
              <div className="bg-background p-4"><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Body · IBM Plex Sans 400</p><p className="mt-2 text-sm">How many people are visible in each sampled frame, as a timeline.</p></div>
              <div className="bg-background p-4"><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Data · IBM Plex Mono</p><p className="mt-2 font-mono text-2xl tabular-nums">1,284 rows</p></div>
            </div>
            <ul className="mt-6 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              <li>· Corners are square. Use a border to separate, not a shadow.</li>
              <li>· Labels are 10px mono caps with wide tracking.</li>
              <li>· Numbers use tabular figures, always mono.</li>
              <li>· One electric action per view. Everything else is quiet.</li>
            </ul>
          </Group>

          <Group id="frame" title="Frame" blurb="The chrome around every page.">
            <Surface code="NAV-01" name="Top bar" used="/projects and the project picker">
              <div className="flex h-14 items-center justify-between border px-4">
                <div className="flex items-center gap-4"><Logo /><span className="h-5 w-px bg-border" /><span className="text-sm font-medium">Your projects</span></div>
                <div className="flex items-center gap-3"><Button size="sm"><Plus className="size-4" />New project</Button><span className="hidden text-xs text-muted-foreground sm:block">maya@demo.argus.dev</span></div>
              </div>
            </Surface>
            <Surface code="NAV-02" name="Sidebar" used="inside a project">
              <ul className="w-56 border text-sm">
                {["Data products", "Sources", "Agents", "Flows", "Assistant"].map((l, i) => (
                  <li key={l} className={cn("border-l-2 px-4 py-2", i === 0 ? "border-electric bg-accent/40 font-medium" : "border-transparent text-muted-foreground")}>{l}</li>
                ))}
              </ul>
            </Surface>
            <Surface code="HDR-01" name="Page header" used="every dashboard page">
              <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
                <div><h4 className="text-2xl font-medium tracking-tight">Harbor Bridge monitoring</h4><p className="mt-1 max-w-xl text-sm text-muted-foreground">Your data products. Open one to see it, link its sources, or download the data as CSV.</p></div>
                <Button><Plus className="size-4" />Add a data product</Button>
              </header>
            </Surface>
          </Group>

          <Group id="projects" title="0 · Projects" blurb="Each project is one slide. Swipe to move between them. A new project is a name and a choice of data products; sources are added afterwards from a small button on the slide.">
            <Surface code="PRJ-01" name="Project slide" used="/projects, one per project">
              <p className="mb-3 max-w-2xl text-sm text-muted-foreground">The slide shows the project&apos;s data products as widgets and nothing else. Sources live in one quiet footer line with a single button, so the slide stays about the data.</p>
              <div className="space-y-4">
                <div><p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">With sources</p><ProjectSlide s={SLIDES[0]} /></div>
                <div><p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">New project, no source yet</p><ProjectSlide s={SLIDES[1]} /></div>
              </div>
            </Surface>
            <Surface code="PRJ-02" name="Project carousel" used="/projects">
              <p className="mb-3 max-w-2xl text-sm text-muted-foreground">One slide fills the page. The next and previous slides peek in at the edges so it is clear there is more to swipe to. The last slide is always &ldquo;New project&rdquo;. Arrow keys and the dots work too.</p>
              <div className="flex items-stretch gap-3 overflow-hidden">
                <div className="hidden w-16 shrink-0 overflow-hidden opacity-40 sm:block"><ProjectSlide s={SLIDES[1]} className="h-full w-[40rem]" /></div>
                <ProjectSlide s={SLIDES[0]} className="min-w-0 flex-1" />
                <div className="hidden w-16 shrink-0 overflow-hidden opacity-40 sm:block"><NewProjectSlide className="h-full w-[40rem]" /></div>
              </div>
              <div className="mt-4"><SlideNav at={0} total={3} /></div>
            </Surface>
            <Surface code="PRJ-03" name="New project" used="last slide, then a dialog">
              <p className="mb-3 max-w-2xl text-sm text-muted-foreground">Two steps and no sources: name it, then pick the data products. Creating it lands on the new slide, where the source button is waiting.</p>
              <div className="space-y-4">
                <NewProjectSlide className="max-w-md" />
                <NewProjectSteps step={1} name="Harbor Bridge monitoring" picked={[]} />
                <NewProjectSteps step={2} name="Harbor Bridge monitoring" picked={["people-count"]} />
              </div>
            </Surface>
            <Surface code="PRJ-04" name="Add a source" used="source button on a slide">
              <p className="mb-3 max-w-2xl text-sm text-muted-foreground">A small panel, not a page. It suggests sources from the products already on the slide. Adding is one click; set-up, accuracy and cost, and watching it run happen on the source afterwards.</p>
              <SourcePopover />
            </Surface>

            <Surface code="PRJ-05" name="Share publicly" used="slide header, Replay page">
              <p className="mb-3 max-w-2xl text-sm text-muted-foreground">Off until the owner agrees. The dialog lists what goes public and what never does, and the share button stays disabled until the box is ticked. Once shared, the button turns to Public and the dialog holds the link and Stop sharing.</p>
              <div className="flex flex-wrap items-center gap-6">
                <div className="space-y-1.5">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Private</p>
                  <ShareProjectDialog id="design-sample" name="Bus stop study" slug={null} />
                </div>
                <div className="space-y-1.5">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Shared</p>
                  <ShareProjectDialog id="design-sample" name="Harbor Bridge monitoring" slug="sample-a" />
                </div>
              </div>
            </Surface>
          </Group>

          <Group id="products" title="1 · Choose a data product" blurb="The user starts here. A data product is its datasets plus one widget, and it tells ARGUS which sources and agents it needs.">
            <Surface code="PRD-01" name="Product card" used="data products home, add dialog">
              <div className="max-w-md border p-4">
                <ProductPreview productId={sample.id} kind={sample.kind} data={[]} />
                <p className="mt-3 text-lg font-medium">{sample.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{sample.summary}</p>
                <p className="mt-2 font-mono text-xs text-muted-foreground">0 rows · latest no data yet</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 border border-dashed px-2 py-1 text-xs text-muted-foreground"><span className="size-1.5 bg-muted-foreground" />Screen share <span className="font-mono text-[10px] uppercase tracking-wider">not linked</span></span>
                  <span className="ml-auto text-sm text-electric">Open →</span>
                </div>
              </div>
            </Surface>
            <Surface code="PRD-02" name="Product page widget" used="/dashboard/products/[id]">
              <WidgetView use={widgetFor(sample)} data={[]} size="full" showSample />
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">Sample data shown. On a real product this is the project’s own rows.</p>
            </Surface>
            <Surface code="PRD-03" name="Product setup bar" used="top of every product page, product card">
              <p className="mb-3 max-w-2xl text-sm text-muted-foreground">Every product is set up in three steps, always in the same order, always visible. Steps are filled in for you: sources are suggested, agents are chosen, and the level starts at Balanced. You only change what you want to.</p>
              <div className="space-y-3">
                {[
                  { tag: "Just added", steps: [["1", "Source", "Pick one. Files is suggested.", false], ["2", "Agents", "Chosen for you", false], ["3", "Accuracy and cost", "Balanced by default", false]] },
                  { tag: "Running", steps: [["1", "Source", "Screen share, linked", true], ["2", "Agents", "3 working", true], ["3", "Accuracy and cost", "Balanced · $32 / hour", true]] },
                ].map((row) => (
                  <div key={row.tag}>
                    <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{row.tag}</p>
                    <ol className="grid gap-px border bg-border sm:grid-cols-3">
                      {row.steps.map(([n, t, d, on]) => (
                        <li key={t as string} className={cn("flex items-center gap-3 bg-background p-3", !on && "text-muted-foreground")}>
                          <span className={cn("grid size-6 shrink-0 place-items-center border font-mono text-xs", on ? "border-signal text-signal" : "border-dashed")}>{on ? <Check className="size-3.5" /> : n}</span>
                          <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-foreground">{t}</span><span className="block truncate text-xs">{d}</span></span>
                          <span className="text-xs text-electric">{on ? "Change" : "Set"}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </Surface>

            <Surface code="DLG-01" name="Add-product dialog" used="products home">
              <div className="max-w-3xl border">
                <div className="border-b p-4"><p className="font-medium">Add a data product</p><Input placeholder="Search data products" className="mt-3" readOnly /></div>
                <div className="flex gap-1.5 border-b p-3">{["All", "Core", "Transportation", "Business"].map((c, i) => <span key={c} className={cn("border px-2.5 py-1 text-xs", i === 0 ? "border-electric text-electric" : "text-muted-foreground")}>{c}</span>)}</div>
                <div className="grid gap-3 p-4 sm:grid-cols-2">
                  {["people-count", "density-heatmap"].map((id) => { const p = products.find((x) => x.id === id)!; return (
                    <div key={id} className="border"><ProductPreview productId={id} kind={p.kind} data={[]} /><div className="flex items-center justify-between gap-2 p-3"><span className="font-medium">{p.name}</span><Button size="sm" variant="outline"><Plus className="size-3.5" />Add</Button></div></div>
                  ); })}
                </div>
              </div>
            </Surface>
          </Group>

          <Group id="widgets" title="Widgets (the product's face)" blurb="Every data product is exactly one widget. A widget declares slots (which fields feed it) and settings (what a viewer can tweak) in a manifest. To add one: write the component in src/widgets/library, describe it in src/widgets/registry.tsx, and any product can point at it with widget: { id, bind, settings }.">
            {widgets.map((w, i) => {
              const m = w.manifest;
              const use = { id: m.id };
              const users = products.filter((p) => widgetFor(p).id === m.id && p.status === "supported");
              return (
                <Surface key={m.id} code={`WID-${String(i + 1).padStart(2, "0")}`} name={m.name} used={users.length ? users.map((p) => p.name).join(", ") : "nothing yet, free for any product to pick"}>
                  <p className="max-w-2xl text-sm text-muted-foreground">{m.summary}</p>
                  <p className="mt-2 font-mono text-[11px] text-muted-foreground">id <span className="text-foreground">{m.id}</span> · shape <span className="text-foreground">{m.shape}</span> · v{m.version}</p>
                  <div className="mt-4 grid gap-6 lg:grid-cols-[18rem_1fr]">
                    <div>
                      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Compact</p>
                      <div className="relative h-32 border bg-muted/30"><span className="absolute right-2 top-2 z-10 bg-background px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Sample</span><WidgetView use={use} data={[]} size="compact" showSample /></div>
                      <p className="mb-1 mt-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Slots</p>
                      <ul className="space-y-1 text-xs">{m.slots.length ? m.slots.map((s) => <li key={s.key}><span className="font-mono">{s.key}</span>{s.required && <span className="text-destructive"> *</span>}{s.multiple && <span className="text-muted-foreground"> (many)</span>} <span className="text-muted-foreground">· {s.hint}</span></li>) : <li className="text-muted-foreground">None. Works on any rows.</li>}</ul>
                      <p className="mb-1 mt-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Settings</p>
                      <ul className="space-y-1 text-xs">{m.settings.length ? m.settings.map((s) => <li key={s.key}><span className="font-mono">{s.key}</span> <span className="text-muted-foreground">· {s.label}, {s.kind}, default {String(s.default) || "empty"}</span></li>) : <li className="text-muted-foreground">None.</li>}</ul>
                    </div>
                    <div className="min-w-0">
                      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Full</p>
                      <WidgetView use={use} data={[]} size="full" showSample />
                    </div>
                  </div>
                </Surface>
              );
            })}
          </Group>

          <Group id="sources" title="2 · Add sources" blurb="Where the raw material comes in. The product suggests what to bring. Adding only registers a source; setup comes after.">
            <Surface code="SRC-01" name="Source option" used="Add-source dialog">
              <p className="mb-3 max-w-2xl text-sm text-muted-foreground">The product tells you what to bring. People count needs video or photos, so Files is suggested first. Adding only registers the source; setup comes after.</p>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {SOURCES.map((s, i) => { const Icon = s.icon; return (
                  <li key={s.name} className={cn("flex flex-col border p-4", i === 0 && "border-electric bg-accent/30")}>
                    <span className="flex items-center gap-2"><Icon className={cn("size-5", i === 0 ? "text-electric" : "text-muted-foreground")} /><span className="font-medium">{s.name}</span>{s.state && <Badge variant={s.state === "Added" ? "outline" : "default"} className="ml-auto">{s.state === "Added" && <Check className="size-3" />}{s.state}</Badge>}</span>
                    <span className="mt-2 text-sm text-muted-foreground">{s.blurb}</span>
                  </li>
                ); })}
              </ul>
            </Surface>

            <Surface code="SRC-02" name="Source status chip" used="product cards, product page">
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 border px-2 py-1 text-xs"><span className="size-1.5 bg-signal" />Screen share <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">linked</span></span>
                <span className="inline-flex items-center gap-1.5 border border-dashed px-2 py-1 text-xs text-muted-foreground"><span className="size-1.5 bg-muted-foreground" />Files <span className="font-mono text-[10px] uppercase tracking-wider">not linked</span></span>
              </div>
            </Surface>

            <Surface code="SRC-04" name="Source timeline" used="source page (Pilot study)">
              <p className="mb-3 max-w-2xl text-sm text-muted-foreground">One source, several tracks on a shared clock, like an edit timeline. Each track is drawn to suit its data: a line for telemetry, a frame strip for video, thumbnails for photos. Mixed data lines up in time, which is what lets agents combine it later.</p>
              <div className="border">
                <TimeRuler marks={["09:00", "09:15", "09:30", "09:45", "10:00"]} />
                <Track m="telemetry" name="Bridge vibration" count="3,600 readings"><Sparkline color="var(--chart-3)" values={[3, 4, 3, 5, 4, 6, 5, 4, 9, 14, 8, 5, 4, 5, 4, 3, 4, 6, 5, 4, 3, 4, 5, 4]} /></Track>
                <Track m="telemetry" name="Rainfall" count="240 readings"><Sparkline color="var(--chart-3)" values={[0, 0, 0, 1, 2, 4, 6, 6, 5, 3, 1, 0]} /></Track>
                <Track m="video" name="Screen share" count="2 frames / s"><Thumbs n={20} hue={258} gap={1} /></Track>
                <Track m="images" name="Portrait photos" count="48 photos"><Thumbs n={12} hue={150} gap={4} /></Track>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Scrub to any moment to see every track at once. Drag a range to send just that slice to an agent.</p>
            </Surface>
          </Group>

          <Group id="agents" title="3 · See the agents" blurb="Agents are the processors. Each is an AI model, plain code, or an opinion, and each is always in a visible state: working, waiting, paused, done or failed. Models propose, code computes, a person decides.">
            <Surface code="AGT-01" name="Agent card" used="Agents page, engine map, product setup">
              <div className="grid gap-3 sm:grid-cols-3">
                {(["model", "code", "human"] as AgentKind[]).map((k) => (
                  <div key={k} className="border p-3"><AgentBadge kind={k} /><p className="mt-1 text-sm text-muted-foreground">{kindRule(k)}</p></div>
                ))}
              </div>
              <div className="mt-4 max-w-sm">
                <AgentCard no={1} name="Perception" kind="model" takes="A photo or frame" gives="Detections with confidence" settings={[{ label: "Minimum confidence", value: "0.50" }]} state="working" />
              </div>
            </Surface>

            <Surface code="AGT-10" name="Agent library" used="Agents page (the only place agents are made)">
              <p className="mb-3 max-w-2xl text-sm text-muted-foreground">Every agent is defined once, here. A pipeline never copies an agent, it points at one. Each card shows the typed plug on each side: what it accepts, then what it hands on. Edit an agent here and every pipeline using it follows.</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{LIBRARY.map((a) => <LibraryCard key={a.id} a={a} />)}<NewAgentTile /></div>
              <p className="mb-1.5 mt-5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Plug types</p>
              <ul className="flex flex-wrap gap-2">{(Object.keys(TYPES) as DataType[]).map((t) => <li key={t}><TypeChip t={t} /></li>)}</ul>
            </Surface>

                        <Surface code="AGT-11" name="Pipeline editor" used="source page, product setup (step 2)">
              <p className="mb-3 max-w-2xl text-sm text-muted-foreground">Each source has a line of agents. One agent&apos;s output plugs into the next one&apos;s input only when the types match, so a line can never be wired wrong. Press the plus and only the agents that fit are offered; the rest are greyed with the reason.</p>
              <div className="space-y-2">
                <TypedChain start="frame" ids={["perception", "track", "tabulate"]} />
                <TypedChain start="readings" ids={["normalize", "threshold", "tabulate"]} />
              </div>
              <div className="mt-5 flex flex-wrap items-start gap-6">
                <div className="flex items-center gap-2">
                  <span className="border p-2 text-sm"><span className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Raw material</span>Screen share</span>
                  <TypeChip t="frame" />
                  <span className="border border-electric p-2 text-sm"><span className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Perception</span>Finds people</span>
                  <TypeChip t="detections" />
                  <span className="grid size-8 place-items-center border border-dashed"><Plus className="size-4" /></span>
                </div>
                <AgentPicker after="detections" />
              </div>
            </Surface>

            <Surface code="AGT-02" name="Agent states" used="every agent, pipeline, engine map">
              <p className="mb-3 max-w-2xl text-sm text-muted-foreground">The state is on the card at all times, with the control that fits it: Pause while working or waiting, Resume while paused, Retry after an error. Colour is never the only signal, the word and icon always show.</p>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {STATES.map((st) => (
                  <li key={st}>
                    <AgentCard name="Correlation" kind="code" takes="Detections and weather" gives="Facts in a window" state={st} />
                    <p className="mt-1.5 text-[11px] text-muted-foreground"><StateBadge state={st} /> · {stateHint(st)}</p>
                  </li>
                ))}
              </ul>
            </Surface>

            <Surface code="AGT-09" name="Opinion agent" used="product page (Reactions), engine map">
              <p className="mb-3 max-w-2xl text-sm text-muted-foreground">A human emulator. It reads a finished product and answers as a stand-in person: would they use it, what worries them, what is missing. Opinions sit beside the data and are always tagged as simulated. They never change a count, a severity or a product, and they are never shown as real people.</p>
              <div className="mt-4 border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm"><span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Asked </span>Would you use a live people count at this stop?</p><SimulatedTag /></div>
                <div className="mt-3 grid gap-3 lg:grid-cols-3">{PANEL.map((o) => <OpinionCard key={o.persona.name} o={o} />)}</div>
                <div className="mt-4"><PanelTally opinions={PANEL} /></div>
              </div>
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                <li>Setup: pick personas (or write one), the question, and how many to ask. Cost scales with the panel size.</li>
                <li>Every opinion cites something in the data. No citation, no opinion.</li>
              </ul>
            </Surface>
          </Group>

          <Group id="tune" title="4 · Tune cost and accuracy" blurb="Cheaper or better is the user's call. Every setting shows what it costs and what it gets you before it is applied.">
                        <Surface code="AGT-05" name="Cost and accuracy" used="product setup (step 3), Agents page">
              <p className="mb-4 max-w-2xl text-sm text-muted-foreground">Two dials decide everything. How careful the agents are, and how often they look. Turn both down and it is cheap but rough and slow to notice. Turn both up and the data is better, and it costs more. One choice sets every agent in the product.</p>
              <TunePanel level={2} freq={1} />
            </Surface>

            <Surface code="AGT-04" name="Confidence lanes" used="Agents page">
              <p className="mb-3 max-w-2xl text-sm text-muted-foreground">Lanes split the line by how sure Perception was. The first enabled lane whose range holds the finding takes it. A quick lane skips the model.</p>
              <ul className="divide-y border text-sm">
                {[["Sure", "0.85 to 1.00", "quick", "no model"], ["Unsure", "0.50 to 0.85", "full", "level Balanced"], ["Doubtful", "0.30 to 0.50", "full", "level Careful"]].map(([n, r, recipe, lvl]) => (
                  <li key={n} className="flex items-center gap-3 px-3 py-2">
                    <span className="w-24 font-medium">{n}</span>
                    <span className="w-28 font-mono text-xs text-muted-foreground">{r}</span>
                    <span className={cn("w-14 border px-1.5 py-0.5 text-center font-mono text-[10px] uppercase tracking-wider", recipe === "quick" ? "text-muted-foreground" : "border-electric text-electric")}>{recipe}</span>
                    <span className="text-muted-foreground">{lvl}</span>
                  </li>
                ))}
              </ul>
            </Surface>
          </Group>

          <Group id="engine" title="5 · Watch the engine" blurb="The whole system running on one screen: sources, agents and products, with state and motion. Open any agent to see exactly what it did.">
                        <Surface code="FLW-02" name="Engine map" used="Flows page: the whole engine, running">
              <p className="mb-3 max-w-2xl text-sm text-muted-foreground">Flows is for watching, not building. Raw material on the left, agents in the middle, finished products on the right. Moving dashes mean data is flowing along that link right now. Amber is paused, red is failed. Hover a box to light up what feeds it and what it feeds.</p>
              <EngineMap nodes={ENGINE_NODES} edges={ENGINE_EDGES} />
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground"><span>2 working</span><span>1 paused</span><span>1 failed</span><span>Balanced · about $32 / hour</span></p>
            </Surface>

            <Surface code="FLW-03" name="Replay" used="Replay page, every shared project on /explore">
              <p className="mb-3 max-w-2xl text-sm text-muted-foreground">The engine map played back from the day the project was made until now. Parts appear when they were added, light up while they ran, and layers count up their rows. Quiet stretches are skipped. Below: a sample six-hour project, then a project with no history yet.</p>
              <ReplayPlayer data={REPLAY_SAMPLE} />
              <div className="mt-6"><ReplayPlayer data={REPLAY_EMPTY} /></div>
            </Surface>

            <Surface code="SRC-06" name="Source pipeline" used="source page, Sources list, engine map">
              <p className="mb-3 max-w-2xl text-sm text-muted-foreground">Think of a factory. The source is the raw material, the agents are the processors, the data product is what comes out: a widget plus clean data. Every source shows its own line and whether it has been analysed yet, so you never guess what is done.</p>
              <div className="space-y-3">
                <SourcePipeline m="video" name="Screen share" count="7,200 frames" done={2450} total={7200} state="working" agents={[{ name: "Perception", kind: "model", state: "working" }, { name: "Track", kind: "code", state: "waiting" }, { name: "Classify", kind: "model", state: "waiting" }]} outs={[{ product: "People count", widget: "Stat and trend", rows: "312 rows" }, { product: "Density heatmap", widget: "Heat grid", rows: "0 rows" }]} />
                <SourcePipeline m="images" name="Portrait photos" count="48 photos" done={48} total={48} state="done" agents={[{ name: "Perception", kind: "model", state: "done" }, { name: "Classify", kind: "model", state: "done" }]} outs={[{ product: "Attribute breakdown", widget: "Stacked share", rows: "48 rows" }]} />
                <SourcePipeline m="telemetry" name="Bridge vibration" count="3,600 readings" done={1800} total={3600} state="paused" agents={[{ name: "Normalize", kind: "code", state: "done" }, { name: "Threshold", kind: "code", state: "paused" }]} outs={[{ product: "Vibration trend", widget: "Stat and trend", rows: "1,800 rows" }]} />
                <SourcePipeline m="images" name="Site inspection photos" count="120 photos" done={0} total={120} state="waiting" agents={[{ name: "Perception", kind: "model", state: "waiting" }, { name: "Verify", kind: "code", state: "waiting" }]} outs={[{ product: "Defect log", widget: "Rows table", rows: "0 rows" }]} />
              </div>
            </Surface>

            <Surface code="AGT-06" name="Agent trace" used="click any agent in the engine map">
              <ul className="border">
                <TraceRow agent="Perception" kind="model" ms={2140} note="3 detections, 2 above 0.50" input="photo bridge-14.jpg" output='[{"class":"crack","conf":0.82}, ...]' open />
                <TraceRow agent="Correlation" kind="code" ms={12} note="Joined 1 vibration reading and rain 12 mm" />
                <TraceRow agent="Analysis" kind="code" ms={1} note="Severity high: vibration 1.8x and rain over 10 mm" />
                <TraceRow agent="Reasoning" kind="model" ms={3380} note="Brief with 4 claims" />
                <TraceRow agent="Verification" kind="code" ms={4} note="3 claims kept, 1 rejected: number not in the facts" />
              </ul>
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">One row per agent. Open a row to see exactly what it was given and what it made.</p>
            </Surface>
          </Group>

          <Group id="explore" title="Explore" blurb="Projects their owners chose to make public. Anyone can watch them without signing in: the products, their rows and the replay. Nothing goes public without the owner agreeing in PRJ-05.">
            <Surface code="EXP-01" name="Shared project card" used="/explore, the landing page Explore section">
              <div className="grid gap-px border bg-border md:grid-cols-3">
                {SHARED.map((p) => <SharedCard key={p.slug} p={p} />)}
              </div>
              <p className="mt-4 border border-dashed p-10 text-center text-sm text-muted-foreground">Nothing shared yet. Share one of yours from your projects.</p>
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">Empty: /explore shows the dashed box; the landing section hides itself.</p>
            </Surface>
          </Group>

          <Group id="states" title="States" blurb="What it looks like when there is nothing, or something to say.">
            <Surface code="STA-01" name="Empty state" used="every list and widget"><Empty text="No data yet. Link a source and rows will show up here." /></Surface>
            <Surface code="STA-02" name="Badges & buttons" used="everywhere">
              <div className="flex flex-wrap items-center gap-3">
                <Button>Primary</Button><Button variant="outline">Outline</Button><Button variant="ghost">Ghost</Button><Button variant="destructive">Destructive</Button>
                <Badge>Suggested</Badge><Badge variant="outline">Added</Badge><Badge variant="secondary">Sample</Badge>
              </div>
            </Surface>
          </Group>
        </main>
      </div>
    </div>
  );
}
