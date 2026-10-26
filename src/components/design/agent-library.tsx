import { ArrowRight, Plus } from "lucide-react";
import { AgentBadge, type AgentKind } from "@/components/design/agent-kit";
import { cn } from "@/lib/utils";

/** What flows between agents. An output can only plug into an input of the same type. */
export type DataType = "frame" | "photo" | "readings" | "detections" | "tracks" | "labels" | "facts" | "events" | "rows" | "opinions";

export const TYPES: Record<DataType, { label: string; color: string; hint: string }> = {
  frame: { label: "Frame", color: "var(--electric)", hint: "One picture from a video" },
  photo: { label: "Photo", color: "var(--signal)", hint: "A still picture" },
  readings: { label: "Readings", color: "var(--chart-3)", hint: "Numbers with a time" },
  detections: { label: "Detections", color: "var(--chart-1)", hint: "Things found in a picture, with confidence" },
  tracks: { label: "Tracks", color: "var(--chart-2)", hint: "The same thing followed over time" },
  labels: { label: "Labels", color: "var(--chart-4)", hint: "A class or group put on each thing" },
  facts: { label: "Facts", color: "var(--chart-5)", hint: "Claims with their evidence" },
  events: { label: "Events", color: "var(--destructive)", hint: "Something that happened at a time" },
  rows: { label: "Rows", color: "var(--foreground)", hint: "Clean table rows a widget can read" },
  opinions: { label: "Opinions", color: "var(--chart-4)", hint: "Simulated views of stand-in people" },
};

export type LibraryAgent = { id: string; name: string; kind: AgentKind; takes: DataType[]; gives: DataType; does: string; usedIn: number };

export const LIBRARY: LibraryAgent[] = [
  { id: "perception", name: "Perception", kind: "model", takes: ["frame", "photo"], gives: "detections", does: "Finds people and objects", usedIn: 3 },
  { id: "track", name: "Track", kind: "code", takes: ["detections"], gives: "tracks", does: "Follows each thing between frames", usedIn: 1 },
  { id: "classify", name: "Classify", kind: "model", takes: ["detections"], gives: "labels", does: "Puts a class on each thing", usedIn: 2 },
  { id: "extract", name: "Extract", kind: "model", takes: ["photo"], gives: "facts", does: "Reads text and values from a picture", usedIn: 1 },
  { id: "normalize", name: "Normalize", kind: "code", takes: ["readings"], gives: "readings", does: "Cleans units and times", usedIn: 2 },
  { id: "threshold", name: "Threshold", kind: "code", takes: ["readings"], gives: "events", does: "Raises an event over a limit", usedIn: 1 },
  { id: "tabulate", name: "Tabulate", kind: "code", takes: ["labels", "tracks", "events", "facts"], gives: "rows", does: "Makes rows a widget can show", usedIn: 4 },
  { id: "panel", name: "Panel opinion", kind: "opinion", takes: ["rows"], gives: "opinions", does: "Reacts as stand-in people", usedIn: 0 },
];

export const canFollow = (prev: DataType, next: LibraryAgent) => next.takes.includes(prev);

export function TypeChip({ t, className }: { t: DataType; className?: string }) {
  const k = TYPES[t];
  return <span title={k.hint} className={cn("inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider", className)}><span className="size-1.5" style={{ background: k.color }} />{k.label}</span>;
}

/** A library entry: the typed plug on each side, so you can see what it will accept and what it hands on. */
export function LibraryCard({ a }: { a: LibraryAgent }) {
  return (
    <div className="flex flex-col border p-3">
      <div className="flex items-center justify-between gap-2"><p className="font-medium">{a.name}</p><AgentBadge kind={a.kind} /></div>
      <p className="mt-1 text-sm text-muted-foreground">{a.does}</p>
      <div className="mt-3 flex items-center gap-2 border-t pt-3">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">{a.takes.map((t) => <TypeChip key={t} t={t} />)}</div>
        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
        <TypeChip t={a.gives} />
      </div>
      <p className="mt-2 font-mono text-[10px] text-muted-foreground">{a.usedIn === 0 ? "Not used yet" : `Used in ${a.usedIn} pipeline${a.usedIn > 1 ? "s" : ""}`}</p>
    </div>
  );
}

export function NewAgentTile() {
  return <div className="grid min-h-32 place-items-center border border-dashed text-sm text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Plus className="size-4" />New agent</span></div>;
}

/** The picker shown after an agent: only agents that accept what the last one hands on are choosable. */
export function AgentPicker({ after }: { after: DataType }) {
  return (
    <div className="w-full max-w-sm border bg-background">
      <p className="border-b p-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Add after this step · it hands on <TypeChip t={after} className="ml-1 align-middle" /></p>
      <ul>
        {LIBRARY.map((a) => {
          const ok = canFollow(after, a);
          return (
            <li key={a.id} className={cn("flex items-center gap-2 border-b p-2 text-sm last:border-b-0", ok ? "hover:bg-accent/40" : "opacity-45")}>
              <span className="min-w-0 flex-1"><span className="block truncate">{a.name}</span>{!ok && <span className="block text-[11px] text-muted-foreground">Needs {a.takes.map((t) => TYPES[t].label.toLowerCase()).join(" or ")}, not {TYPES[after].label.toLowerCase()}</span>}</span>
              <AgentBadge kind={a.kind} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A finished chain, each join labelled with the type passed across it. */
export function TypedChain({ start, ids }: { start: DataType; ids: string[] }) {
  const agents = ids.map((id) => LIBRARY.find((a) => a.id === id)!);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <TypeChip t={start} />
      {agents.map((a) => (
        <span key={a.id} className="flex items-center gap-2">
          <ArrowRight className="size-3.5 text-muted-foreground" />
          <span className="border px-2 py-1 text-sm">{a.name}</span>
          <ArrowRight className="size-3.5 text-muted-foreground" />
          <TypeChip t={a.gives} />
        </span>
      ))}
    </div>
  );
}
