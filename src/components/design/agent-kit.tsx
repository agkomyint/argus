import { AlertTriangle, Bot, Check, Clock, Code2, Loader2, MessageSquareQuote, Pause, Play, Square, User, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type AgentKind = "model" | "code" | "human" | "opinion";

const KIND = {
  model: { label: "AI model", icon: Bot, tone: "text-electric", rule: "Proposes. Never sets severity or counts." },
  code: { label: "Code", icon: Code2, tone: "text-muted-foreground", rule: "Deterministic. Same input, same output." },
  opinion: { label: "Opinion", icon: MessageSquareQuote, tone: "text-chart-4", rule: "Speaks as a stand-in person. A view, not a fact. Never changes a count." },
  human: { label: "Person", icon: User, tone: "text-signal", rule: "Approves or dismisses." },
} as const;

/** Says who does the work in a step. The one thing every agent surface must show. */
export function AgentBadge({ kind }: { kind: AgentKind }) {
  const k = KIND[kind];
  const Icon = k.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider", k.tone)}>
      <Icon className="size-3" />{k.label}
    </span>
  );
}

export const kindRule = (kind: AgentKind) => KIND[kind].rule;

export type AgentState = "working" | "waiting" | "paused" | "done" | "error";

const STATE = {
  working: { label: "Working", icon: Loader2, tone: "text-electric", spin: true, frame: "border-electric", hint: "Running now" },
  waiting: { label: "Waiting", icon: Clock, tone: "text-muted-foreground", spin: false, frame: "border-dashed", hint: "Needs input or an upstream step" },
  paused: { label: "Paused", icon: Pause, tone: "text-chart-4", spin: false, frame: "border-chart-4", hint: "Held by a person. Resume to continue" },
  done: { label: "Done", icon: Check, tone: "text-signal", spin: false, frame: "", hint: "Finished" },
  error: { label: "Error", icon: AlertTriangle, tone: "text-destructive", spin: false, frame: "border-destructive", hint: "Failed. Retry or check the trace" },
} as const;

export const STATES = Object.keys(STATE) as AgentState[];
export const stateHint = (s: AgentState) => STATE[s].hint;

/** Always visible on an agent: is it working, waiting, paused, done or failed. */
export function StateBadge({ state }: { state: AgentState }) {
  const k = STATE[state];
  const Icon = k.icon;
  return (
    <span role="status" className={cn("inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider", k.tone)}>
      <Icon className={cn("size-3", k.spin && "animate-spin")} />{k.label}
    </span>
  );
}

export type Setting = { label: string; value: string };

/** One agent in the line: what it is, its state, what goes in and out, what you can tune, and its control. */
export function AgentCard({ no, name, kind, takes, gives, settings, state = "waiting" }: { no?: number; name: string; kind: AgentKind; takes: string; gives: string; settings?: Setting[]; state?: AgentState }) {
  return (
    <div className={cn("flex h-full flex-col border p-3", STATE[state].frame)}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-muted-foreground">{no !== undefined ? String(no).padStart(2, "0") : ""}</span>
        <AgentBadge kind={kind} />
      </div>
      <p className="mt-1 font-medium">{name}</p>
      <div className="mt-1 flex items-center justify-between gap-2"><StateBadge state={state} />
        {(state === "working" || state === "waiting") && <span className="inline-flex items-center gap-1 border px-1.5 py-0.5 text-[11px] hover:bg-accent/50"><Pause className="size-3" />Pause</span>}
        {state === "paused" && <span className="inline-flex items-center gap-1 border border-chart-4 px-1.5 py-0.5 text-[11px] text-chart-4"><Play className="size-3" />Resume</span>}
        {state === "error" && <span className="inline-flex items-center gap-1 border px-1.5 py-0.5 text-[11px]"><X className="size-3" />Retry</span>}
      </div>
      <dl className="mt-2 space-y-1 text-xs">
        <div className="flex gap-2"><dt className="w-10 shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">In</dt><dd>{takes}</dd></div>
        <div className="flex gap-2"><dt className="w-10 shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Out</dt><dd>{gives}</dd></div>
      </dl>
      {settings && settings.length > 0 && (
        <ul className="mt-3 space-y-1 border-t pt-2">
          {settings.map((s) => (
            <li key={s.label} className="flex justify-between gap-2 text-xs"><span className="text-muted-foreground">{s.label}</span><span className="font-mono tabular-nums">{s.value}</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One line of an agent trace: who ran, how long, what it said, and what it saw and made. */
export function TraceRow({ agent, kind, ms, note, input, output, open }: { agent: string; kind: AgentKind; ms: number; note: string; input?: string; output?: string; open?: boolean }) {
  return (
    <li className="border-b last:border-b-0">
      <div className="flex items-center gap-3 px-3 py-2 text-sm">
        <span className="w-24 shrink-0 font-medium">{agent}</span>
        <span className="w-20 shrink-0"><AgentBadge kind={kind} /></span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{note}</span>
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{ms} ms</span>
      </div>
      {open && (
        <div className="grid gap-px border-t bg-border text-xs sm:grid-cols-2">
          <pre className="overflow-x-auto bg-background p-3 font-mono"><span className="text-muted-foreground">in </span>{input}</pre>
          <pre className="overflow-x-auto bg-background p-3 font-mono"><span className="text-muted-foreground">out </span>{output}</pre>
        </div>
      )}
    </li>
  );
}

export type JobStatus = "queued" | "running" | "done" | "failed";

const JOB = {
  queued: { dot: "bg-muted-foreground", text: "text-muted-foreground" },
  running: { dot: "bg-electric animate-pulse", text: "text-electric" },
  done: { dot: "bg-signal", text: "text-foreground" },
  failed: { dot: "bg-destructive", text: "text-destructive" },
} as const;

/** A queued piece of work with its state, tries, and the control to stop it. */
export function JobRow({ name, status, detail, attempts, stoppable }: { name: string; status: JobStatus; detail: string; attempts?: number; stoppable?: boolean }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2 text-sm">
      <span className={cn("size-2 shrink-0", JOB[status].dot)} />
      <span className="w-28 shrink-0 font-medium">{name}</span>
      <span className={cn("w-16 shrink-0 font-mono text-[10px] uppercase tracking-wider", JOB[status].text)}>{status}</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{detail}</span>
      {attempts !== undefined && attempts > 1 && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">try {attempts}</span>}
      {stoppable && <span className="inline-flex shrink-0 items-center gap-1 border px-2 py-1 text-xs hover:bg-accent/50"><Square className="size-3" />Stop</span>}
      {status === "failed" && <span className="inline-flex shrink-0 items-center gap-1 border px-2 py-1 text-xs"><X className="size-3" />Retry</span>}
    </li>
  );
}
