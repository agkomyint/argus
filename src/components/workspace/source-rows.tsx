import { Pause, Play, RotateCcw } from "lucide-react";
import { retrySource, setSourcePaused } from "@/app/engine-actions";
import { StateBadge } from "@/components/design/agent-kit";
import { ActionButton } from "@/components/workspace/pipeline-controls";
import type { SourceStatus } from "@/lib/engine";
import { cn } from "@/lib/utils";

/** Pause, resume and retry for one source. Running work finishes; queued work waits. */
function SourceControls({ s }: { s: SourceStatus }) {
  return (
    <span className="flex gap-1.5">
      {s.failed > 0 && s.state !== "paused" && <ActionButton action={retrySource.bind(null, s.key)}><RotateCcw className="size-3.5" />Retry {s.failed}</ActionButton>}
      {s.canPause && (s.state === "paused" ? (
        <ActionButton variant="default" action={setSourcePaused.bind(null, s.key, false)}><Play className="size-3.5" />Resume</ActionButton>
      ) : (
        <ActionButton action={setSourcePaused.bind(null, s.key, true)}><Pause className="size-3.5" />Pause</ActionButton>
      ))}
    </span>
  );
}

/** A thin progress bar: done in signal, failed in red, the rest still to go. */
function SourceProgress({ s, className }: { s: SourceStatus; className?: string }) {
  const pct = (n: number) => `${s.total ? (n / s.total) * 100 : 0}%`;
  return (
    <span className={cn("flex h-1 w-full bg-muted", className)} aria-hidden>
      <span className={cn("h-1", s.state === "paused" ? "bg-chart-4" : "bg-signal")} style={{ width: pct(s.done) }} />
      <span className="h-1 bg-destructive" style={{ width: pct(s.failed) }} />
    </span>
  );
}

/** One line under a source on the Sources page: its state, how far along, and its controls. */
export function SourceStatusLine({ s }: { s?: SourceStatus }) {
  if (!s) return null;
  return (
    <div className="mt-2 grid items-center gap-x-4 gap-y-1.5 sm:grid-cols-[6rem_minmax(0,1fr)_auto]">
      <StateBadge state={s.state} />
      <span className="flex items-center gap-3">
        <SourceProgress s={s} className="max-w-64" />
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">{s.total ? `${s.done}/${s.total} ${s.unit}` : `no ${s.unit} yet`}{s.failed ? ` · ${s.failed} failed` : ""}</span>
      </span>
      <SourceControls s={s} />
    </div>
  );
}
