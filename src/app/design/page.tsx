import { Check, CloudSun, FolderOpen, Monitor, Plus, Radio, Webhook } from "lucide-react";
import type { Metadata } from "next";
import { STATES, StateBadge, stateHint } from "@/components/design/agent-kit";
import { AskKit } from "@/components/assistant/ask-kit";
import { DECK, NewProjectSlide } from "@/components/design/project-kit";
import { SetupStates } from "@/components/design/setup-kit";
import { ProjectDeck } from "@/components/workspace/project-deck";
import { pickableProducts } from "@/lib/pickable";
import { PUBLIC_PRODUCTS, PUBLIC_PROJECT, PUBLIC_REPLAY, PUBLIC_TIMELINE, PUBLIC_TIMELINE_LOCKED, PUBLIC_VIEW, PUBLIC_VIEW_PRIVATE } from "@/components/explore/public-samples";
import { PublicStudio } from "@/components/explore/public-studio";
import { ShareProjectDialog } from "@/components/workspace/share-project-dialog";
import { SharedCard } from "@/components/landing/explore-teaser";
import { Group, Surface, Swatch, surfaceId } from "@/components/design/surface";
import { StudioKit } from "@/components/studio/studio-kit";
import { Logo } from "@/components/landing/logo";
import { LandingHero } from "@/components/landing/hero";
import { LandingExamples } from "@/components/landing/examples";
import { LandingExplore } from "@/components/landing/explore-showcase";
import { LandingProjects } from "@/components/landing/projects";
import { LandingProjectTabs } from "@/components/landing/project-tabs";
import { LandingStudio } from "@/components/landing/studio";
import { LandingCapabilities } from "@/components/landing/capabilities";
import { Docs, DocsFaq, DocsGuide, LandingDocs } from "@/components/docs/docs";
import { FAQ, GUIDES } from "@/components/docs/content";
import { LandingFooter } from "@/components/landing/landing-footer";
import { VersionTag } from "@/components/workspace/version-tag";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/widgets/empty";
import { products } from "@/products";
import { widgets } from "@/widgets/registry";
import { widgetFor } from "@/widgets/resolve";
import { WidgetView } from "@/widgets/use";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Design system — ARGUS" };

const wave = (f: (i: number) => number) => Array.from({ length: 24 }, (_, i) => Math.max(0, Math.min(1, f(i))));
const SHARED = [
  { slug: "sample-a", name: "Harbor Bridge monitoring", kind: "bridge", owner: "Maya", sharedAt: new Date(Date.UTC(2026, 9, 26)), products: ["People count", "Apparent attribute breakdown", "Object detection dataset", "Defect log"], rows: 4210, posters: ["/studio-preview.png", "/projects-preview.png"], activity: wave((i) => 0.35 + 0.45 * Math.sin(i / 3) ** 2 + (i % 5) / 20), spanMs: 5 * 3_600_000 },
  { slug: "sample-b", name: "Wikipedia through four visitors", kind: "general", owner: "Sam", sharedAt: new Date(Date.UTC(2026, 9, 24)), products: ["Perception map", "Persona agreement", "Friction log"], rows: 68, activity: wave((i) => (i % 5 === 0 ? 1 : 0.1)), spanMs: 9 * 60_000 },
  { slug: "sample-c", name: "Bus stop study", kind: "general", owner: "Sam", sharedAt: new Date(Date.UTC(2026, 9, 20)), products: ["People count"], rows: 0 },
];

const SURFACES: { group: string; items: [string, string][] }[] = [
  { group: "ARGUS Studio", items: [["STU-01", "ARGUS Studio"], ["STU-02", "Studio, empty and loading"], ["STU-03", "Setup windows"], ["STU-06", "Lanes window"], ["STU-07", "Drop files into lanes"], ["STU-04", "Observatory"], ["STU-05", "Studio timeline"], ["STU-08", "Data products rail"], ["STU-09", "Preview with SAM outlines"]] },
  { group: "Frame", items: [["NAV-01", "Top bar"], ["HDR-01", "Page header"], ["VER-01", "Version tag"]] },
  { group: "0 · Projects", items: [["PRJ-01", "Project deck"], ["PRJ-03", "New project"], ["PRJ-05", "Share publicly"]] },
  { group: "Ask ARGUS", items: [["AI-01", "Ask ARGUS chat"]] },
  { group: "1 · Products", items: [["PRD-02", "Product page widget"]] },
  { group: "Widgets", items: widgets.map((w, i) => [`WID-${String(i + 1).padStart(2, "0")}`, w.manifest.name] as [string, string]) },
  { group: "2 · Sources", items: [["SRC-01", "Source option"]] },
  { group: "3 · Agents", items: [["AGT-02", "Agent states"]] },
  { group: "Landing", items: [["LND-01", "Hero"], ["LND-02", "Data product examples"], ["LND-03", "Projects introduction"], ["LND-04", "Studio introduction"], ["LND-05", "Capabilities"], ["LND-06", "Use cases"], ["LND-07", "Footer"], ["LND-08", "Explore showcase"], ["LND-09", "Project and Studio tabs"]] },
  { group: "Explore", items: [["EXP-01", "Shared project card"], ["EXP-02", "Public replay studio"]] },
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
        <span className="ml-auto hidden font-mono text-[11px] text-muted-foreground sm:block">Name a surface by its code, for example “make PRD-02 wider”.</span>
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

          <Group id="studio" title="ARGUS Studio" blurb="Lives at /studio/[id], one per project. One project on one screen, laid out like OBS. The program view shows the stream with every model's output drawn on it, data products are the scenes, sources list the layers each model adds, and the mixer has one strip per model. Drag the dividers to resize. Space plays, arrows step a frame, 1 to 5 switch products, F goes full screen.">
            <StudioKit />
          </Group>

          <Group id="frame" title="Frame" blurb="The chrome around every page.">
            <Surface code="NAV-01" name="Top bar" used="/projects and the project picker">
              <div className="flex h-14 items-center justify-between border px-4">
                <div className="flex items-center gap-4"><Logo /><span className="h-5 w-px bg-border" /><span className="text-sm font-medium">Your projects</span></div>
                <div className="flex items-center gap-3"><Button size="sm"><Plus className="size-4" />New project</Button><span className="hidden text-xs text-muted-foreground sm:block">maya@demo.argus.dev</span></div>
              </div>
            </Surface>
            <Surface code="HDR-01" name="Page header" used="project chooser and new-project pages">
              <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
                <div><h4 className="text-2xl font-medium tracking-tight">Harbor Bridge monitoring</h4><p className="mt-1 max-w-xl text-sm text-muted-foreground">Your data products. Open one to see it, link its sources, or download the data as CSV.</p></div>
                <Button><Plus className="size-4" />Add a data product</Button>
              </header>
            </Surface>
            <Surface code="VER-01" name="Version tag" used="the workspace sidebar, next to the logo">
              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2"><Logo /><VersionTag /></div>
                <div className="flex items-center gap-2"><Logo /><VersionTag version="0.2.0-rc.1" /></div>
                <div className="flex items-center gap-2"><Logo /><VersionTag version="dev" /></div>
              </div>
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">This build, a prerelease, and dev (no version set). The value comes from package.json at build time.</p>
            </Surface>
          </Group>

          <Group id="projects" title="0 · Projects" blurb="Each project is one full-screen slide, made to present. A new project is a name and a choice of data products; sources are connected afterwards in the studio.">
            <Surface code="PRJ-01" name="Project deck" used="/projects, full screen, one slide per project. Real size at /design/projects">
              <p className="mb-3 max-w-2xl text-sm text-muted-foreground">Made for showing someone the work. Each slide is one line about the project (name, description, sources) and its data products as panels that fill the screen. Up to three rows fit with no scroll; more scroll. Small panels use the compact view of the widget, and any panel can be expanded to the whole stage. Clicking a product or the main button opens the studio, where it is configured. The filmstrip moves between projects; ← →, F to present full screen, Enter to open the studio.</p>
              <div className="space-y-6">
                <div><p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Three projects, first open (preview samples on)</p><ProjectDeck slides={DECK} start={0} items={pickableProducts()} showSample className="h-[44rem] border" /></div>
                <div><p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Many products: nine panels and three more in the studio (expand any panel)</p><ProjectDeck slides={DECK} start={3} items={pickableProducts()} showSample className="h-[44rem] border" /></div>
                <div><p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Products picked, no data yet: no made-up charts</p><ProjectDeck slides={DECK} start={1} items={pickableProducts()} className="h-[34rem] border" /></div>
                <div><p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">A project with no products yet</p><ProjectDeck slides={DECK} start={2} items={pickableProducts()} className="h-[34rem] border" /></div>
                <div><p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">No projects yet</p><ProjectDeck slides={[]} start={0} items={pickableProducts()} className="h-[24rem] border" /></div>
              </div>
            </Surface>
            <Surface code="PRJ-03" name="New project" used="last slide, then a dialog">
              <p className="mb-3 max-w-2xl text-sm text-muted-foreground">AI setup in three steps. The person says what they want to track; a Meta model suggests data products, then plans the lanes and links each lane to the products it feeds; code checks the plan and sends it back once if it fails. Every step is traced and moves into the new project&apos;s Observatory.</p>
              <div className="space-y-4">
                <NewProjectSlide className="max-w-md" />
                <SetupStates items={pickableProducts()} />
              </div>
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

          <Group id="assistant" title="Ask ARGUS" blurb="One chat over all of a user's projects. Type @ to narrow a question to one or more projects. The model chooses what to look up; code computes every number and the answer shows each lookup as a receipt. It answers questions only: setup stays in the studio.">
            <Surface code="AI-01" name="Ask ARGUS chat" used="the top bar of /projects and ARGUS Studio, opening as a panel on the right">
              <p className="mb-3 max-w-2xl text-sm text-muted-foreground">The one place that breaks the flat, square rule on purpose: rounded, soft and friendly, so the assistant reads as a person to talk to. Opened from a slide or a studio, a new chat starts tagged with that project; remove the tag to ask about everything. Backspace in an empty box removes the last tag.</p>
              <AskKit />
            </Surface>
          </Group>
          <Group id="products" title="1 · Choose a data product" blurb="The user starts here. A data product is its datasets plus one widget, and it tells ARGUS which sources and agents it needs.">
            <Surface code="PRD-02" name="Product page widget" used="product widgets in the studio">
              <WidgetView use={widgetFor(sample)} data={[]} size="full" showSample />
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">Sample data shown. On a real product this is the project’s own rows.</p>
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
          </Group>

          <Group id="agents" title="3 · See the agents" blurb="Agents are the processors. Each is an AI model, plain code, or an opinion, and each is always in a visible state: working, waiting, paused, done or failed. Models propose, code computes, a person decides.">
            <Surface code="AGT-02" name="Agent states" used="project slides, studio source list">
              <p className="mb-3 max-w-2xl text-sm text-muted-foreground">Every agent and source shows its state as a word and an icon. Colour is never the only signal.</p>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {STATES.map((st) => (
                  <li key={st} className="border p-3"><StateBadge state={st} /><p className="mt-1.5 text-[11px] text-muted-foreground">{stateHint(st)}</p></li>
                ))}
              </ul>
            </Surface>
          </Group>

          <Group id="landing" title="Landing" blurb="The landing page introduction.">
            <Surface code="LND-01" name="Hero" used="home page"><LandingHero /></Surface>
            <Surface code="LND-02" name="Data product examples" used="home page"><LandingExamples /></Surface>
            <Surface code="LND-03" name="Projects introduction" used="home page"><LandingProjects /></Surface>
            <Surface code="LND-04" name="Studio introduction" used="home page"><LandingStudio /></Surface>
            <Surface code="LND-05" name="Capabilities" used="home page"><LandingCapabilities /></Surface>
            <Surface code="LND-06" name="Documentation and FAQ" used="home page"><LandingDocs /></Surface>
            <Surface code="LND-07" name="Footer" used="home page"><LandingFooter /></Surface>
            <Surface code="LND-08" name="Explore showcase" used="home page"><LandingExplore projects={SHARED} /><LandingExplore /></Surface>
            <Surface code="LND-09" name="Project and Studio tabs" used="home page"><LandingProjectTabs /></Surface>
          </Group>

          <Group id="docs" title="Docs" blurb="Lives at /docs, with its first guides and basic questions on the home page (LND-06). Each guide is numbered steps on the real screen they happen on: the screenshots in public/docs are taken from the running app. Questions are native disclosure rows, so answers work without script and show up in find-in-page.">
            <Surface code="DOC-01" name="Guide" used="/docs">
              <p className="mb-2 font-mono text-[11px] text-muted-foreground">Wide screenshot with caption and tips; a tall one (Ask ARGUS) is held to phone width; a guide with no tips.</p>
              <DocsGuide guide={GUIDES[0]} n={1} />
              <DocsGuide guide={GUIDES.find((g) => g.id === "ask-argus")!} n={10} />
              <DocsGuide guide={GUIDES.find((g) => g.id === "manage-products")!} n={9} />
            </Surface>
            <Surface code="DOC-02" name="FAQ" used="/docs, the home page">
              <p className="mb-2 font-mono text-[11px] text-muted-foreground">Closed, as the page opens, then one section open.</p>
              <DocsFaq sections={FAQ.slice(0, 1)} />
              <div className="mt-8"><DocsFaq sections={FAQ.slice(2, 3)} open /></div>
            </Surface>
            <Surface code="DOC-03" name="Docs page" used="/docs">
              <p className="mb-2 font-mono text-[11px] text-muted-foreground">Two guides and one question section, with the contents rail.</p>
              <Docs guides={GUIDES.slice(3, 5)} faq={FAQ.slice(1, 2)} />
            </Surface>
          </Group>

          <Group id="explore" title="Explore" blurb="Projects their owners chose to make public. Anyone can watch them without signing in: the products, their rows and the replay. Nothing goes public without the owner agreeing in PRJ-05.">
            <Surface code="EXP-01" name="Shared project card" used="/explore, the landing page Explore section">
              <p className="mb-2 font-mono text-[11px] text-muted-foreground">With shared pictures, timeline only, and brand new. Hover one to play its preview.</p>
              <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 md:grid-cols-3">
                {SHARED.map((p) => <SharedCard key={p.slug} p={p} />)}
              </div>
              <p className="mt-4 border border-dashed p-10 text-center text-sm text-muted-foreground">Nothing shared yet. Share one of yours from your projects.</p>
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">Empty: /explore shows the dashed box; the landing section hides itself.</p>
            </Surface>
            <Surface code="EXP-02" name="Public replay studio" used="/explore/[slug]">
              <p className="mb-2 font-mono text-[11px] text-muted-foreground">Media shared, part way through. Click a thumbnail to open it, a step to inspect it, a lane to seek.</p>
              <div className="h-[760px] overflow-hidden border"><PublicStudio project={PUBLIC_PROJECT} replay={PUBLIC_REPLAY} products={PUBLIC_PRODUCTS} view={PUBLIC_VIEW} timeline={PUBLIC_TIMELINE_LOCKED} start={PUBLIC_REPLAY.start + 135 * 60_000} className="h-full" /></div>
              <p className="mb-2 mt-6 font-mono text-[11px] text-muted-foreground">Middle panels: − minimizes one to its bar and gives the other the room; ⤢ maximizes; a lit button or a double-click on the bar restores both. The split is kept per viewer, so these start as shown until you pick (preview maximized here).</p>
              <div className="h-[560px] overflow-hidden border"><PublicStudio project={PUBLIC_PROJECT} replay={PUBLIC_REPLAY} products={PUBLIC_PRODUCTS} view={PUBLIC_VIEW} timeline={PUBLIC_TIMELINE_LOCKED} start={PUBLIC_REPLAY.start + 135 * 60_000} middle="preview" className="h-full" /></div>
              <p className="mb-2 mt-6 font-mono text-[11px] text-muted-foreground">Media kept private: rows and the pipeline only.</p>
              <div className="h-[560px] overflow-hidden border"><PublicStudio project={PUBLIC_PROJECT} replay={PUBLIC_REPLAY} products={PUBLIC_PRODUCTS} view={PUBLIC_VIEW_PRIVATE} timeline={PUBLIC_TIMELINE} className="h-full" /></div>
              <p className="mb-2 mt-6 font-mono text-[11px] text-muted-foreground">Shared before anything ran.</p>
              <div className="h-[420px] overflow-hidden border"><PublicStudio project={{ ...PUBLIC_PROJECT, name: "Empty study" }} replay={null} products={[]} view={{ media: [], producers: {}, samples: {} }} className="h-full" /></div>
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

