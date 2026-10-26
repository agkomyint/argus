import { StateBadge, type AgentKind, type AgentState } from "@/components/design/agent-kit";
import { Activity, FileText, Image as ImageIcon, Radio, Video, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Modality = "telemetry" | "video" | "images" | "documents" | "events";

export const MODALITY: Record<Modality, { label: string; icon: LucideIcon; color: string; carries: string; unit: string; arrives: string; agents: string; powers: string }> = {
  telemetry: { label: "Telemetry", icon: Activity, color: "var(--chart-3)", carries: "Numbers over time: vibration, temperature, GPS, water level", unit: "readings", arrives: "Live feed or CSV", agents: "Normalize, Threshold, Correlate", powers: "Trends, alerts, forecasts" },
  video: { label: "Video", icon: Video, color: "var(--electric)", carries: "Moving pictures: CCTV, screen share, drone, phone camera", unit: "frames", arrives: "Live capture or clip", agents: "Perception, Track, Classify", powers: "Counts, flows, heatmaps" },
  images: { label: "Photos", icon: ImageIcon, color: "var(--signal)", carries: "Still pictures: inspection photos, portraits, satellite", unit: "photos", arrives: "Upload to a lane", agents: "Perception, Extract, Classify", powers: "Datasets, breakdowns, change checks" },
  documents: { label: "Documents", icon: FileText, color: "var(--chart-4)", carries: "Pages: PDFs, plans, inspection reports", unit: "pages", arrives: "Upload", agents: "Extract, Verify", powers: "Facts with page evidence" },
  events: { label: "Events", icon: Radio, color: "var(--chart-5)", carries: "Things that happened: webhooks, MQTT, alerts", unit: "events", arrives: "Webhook or stream", agents: "Normalize, Classify", powers: "Feeds, alerts" },
};

export const MODALITIES = Object.keys(MODALITY) as Modality[];

/** The colour-and-icon mark every source carries, so you can tell the kind of data at a glance. */
export function ModalityMark({ m, className }: { m: Modality; className?: string }) {
  const k = MODALITY[m];
  const Icon = k.icon;
  return <span className={cn("inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider", className)}><Icon className="size-3.5" style={{ color: k.color }} />{k.label}</span>;
}

/** One track in a source timeline. The strip is drawn to suit the kind of data. */
export function Track({ m, name, count, children }: { m: Modality; name: string; count: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] border-b last:border-b-0">
      <div className="border-r p-2">
        <ModalityMark m={m} />
        <p className="mt-1 truncate text-xs">{name}</p>
        <p className="font-mono text-[10px] tabular-nums text-muted-foreground">{count}</p>
      </div>
      <div className="flex h-16 items-center overflow-hidden p-1.5">{children}</div>
    </div>
  );
}

export function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values), min = Math.min(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${100 - ((v - min) / (max - min || 1)) * 90 - 5}`).join(" ");
  return <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full"><polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" /></svg>;
}

/** Placeholder frames: gradients stand in for real thumbnails in the design page. */
export function Thumbs({ n, hue, gap = 2 }: { n: number; hue: number; gap?: number }) {
  return (
    <div className="flex h-full w-full" style={{ gap }}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="h-full min-w-0 flex-1 border" style={{ background: `linear-gradient(${120 + i * 23}deg, oklch(0.32 0.06 ${hue + i * 9}), oklch(0.2 0.03 ${hue + i * 5}))` }} />
      ))}
    </div>
  );
}

export function TimeRuler({ marks }: { marks: string[] }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] border-b bg-accent/20">
      <span className="border-r p-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Time</span>
      <div className="flex justify-between p-2 font-mono text-[10px] tabular-nums text-muted-foreground">{marks.map((m) => <span key={m}>{m}</span>)}</div>
    </div>
  );
}



export type PipeAgent = { name: string; kind: AgentKind; state: AgentState };
export type PipeOut = { product: string; widget: string; rows: string };

/**
 * A source as a pipeline: raw material in, agents as the processors, a data product out,
 * with how much of the raw material has been analysed so far.
 */
export function SourcePipeline({ m, name, count, done, total, state, agents, outs }: { m: Modality; name: string; count: string; done: number; total: number; state: AgentState; agents: PipeAgent[]; outs: PipeOut[] }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const unit = MODALITY[m].unit;
  return (
    <div className={cn("border", state === "error" && "border-destructive", state === "paused" && "border-chart-4", state === "working" && "border-electric")}>
      <div className="grid gap-px bg-border lg:grid-cols-[13rem_1fr_13rem]">
        <div className="bg-background p-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Raw material</p>
          <p className="mt-1.5"><ModalityMark m={m} /></p>
          <p className="mt-1 truncate text-sm font-medium">{name}</p>
          <p className="font-mono text-[10px] tabular-nums text-muted-foreground">{count}</p>
        </div>
        <div className="bg-background p-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Processors</p>
          <ol className="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-1.5">
            {agents.map((a, i) => (
              <li key={a.name} className="flex items-center gap-1">
                {i > 0 && <span className="h-px w-3 bg-border" />}
                <span className={cn("inline-flex items-center gap-2 border px-2 py-1 text-xs", a.state === "waiting" && "border-dashed text-muted-foreground")}>
                  {a.name}<StateBadge state={a.state} />
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-3">
            <div className="h-1 bg-muted"><div className="h-full bg-electric" style={{ width: `${pct}%` }} /></div>
            <p className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-muted-foreground"><span>{done.toLocaleString()} of {total.toLocaleString()} {unit} analysed</span><span>{pct}%</span></p>
          </div>
        </div>
        <div className="bg-background p-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Data products</p>
          <ul className="mt-1.5 space-y-1.5">
            {outs.map((o) => (
              <li key={o.product} className="border p-1.5"><p className="truncate text-sm">{o.product}</p><p className="font-mono text-[10px] text-muted-foreground">{o.widget} · {o.rows}</p></li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t px-3 py-1.5">
        <span className="flex items-center gap-2 text-xs"><StateBadge state={state} /><span className="text-muted-foreground">{SOURCE_STATE[state]}</span></span>
        <span className="text-xs">{state === "working" ? "Pause analysis" : state === "paused" ? "Resume analysis" : state === "error" ? "Retry" : state === "waiting" ? "Analyse now" : "Analyse again"}</span>
      </div>
    </div>
  );
}

const SOURCE_STATE: Record<AgentState, string> = {
  waiting: "Not analysed yet. The raw material is stored and waiting.",
  working: "The agents are reading it now. Products fill in as rows come out.",
  paused: "Held by you. Nothing is lost; resume to carry on from where it stopped.",
  done: "Fully analysed. Products are up to date.",
  error: "An agent failed part way. What finished is kept.",
};
