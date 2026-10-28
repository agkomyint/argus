import { AlertTriangle, Check, Clock, Loader2, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

export type AgentKind = "model" | "code" | "human" | "opinion";

export type AgentState = "working" | "waiting" | "paused" | "done" | "error";

const STATE = {
  working: { label: "Working", icon: Loader2, tone: "text-electric", spin: true, hint: "Running now" },
  waiting: { label: "Waiting", icon: Clock, tone: "text-muted-foreground", spin: false, hint: "Needs input or an upstream step" },
  paused: { label: "Paused", icon: Pause, tone: "text-chart-4", spin: false, hint: "Held by a person. Resume to continue" },
  done: { label: "Done", icon: Check, tone: "text-signal", spin: false, hint: "Finished" },
  error: { label: "Error", icon: AlertTriangle, tone: "text-destructive", spin: false, hint: "Failed. Retry or check the trace" },
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
