"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, ChevronRight, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export type TraceKind = "model" | "code" | "tool";

/** One recorded step: a model call, a code step or a tool the model chose. Built by src/lib/traces.ts. */
export type TraceStep = {
  id: string;
  at: Date;
  kind: TraceKind;
  name: string;
  model: string | null;
  status: "ok" | "error";
  ms: number;
  tokensIn: number | null;
  tokensOut: number | null;
  input: unknown;
  output: unknown;
  error: string | null;
  observations: number;
  /** What it ran on, e.g. "clip.mp4" or "Ask ARGUS". */
  subject: string | null;
};

const KIND = {
  model: { label: "Model", tone: "border-electric/40 text-electric" },
  code: { label: "Code", tone: "border-signal/40 text-signal" },
  tool: { label: "Tool", tone: "border-chart-4/40 text-chart-4" },
} as const;

type Filter = TraceKind | "error" | "all";

const time = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${n} ms`);
const label = "font-mono text-[10px] uppercase tracking-wider text-muted-foreground";

function Json({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <p className={cn(label, "mb-1")}>{title}</p>
      <pre className="max-h-64 overflow-auto border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words">
        {value == null ? "—" : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

/**
 * The Observatory window: everything ARGUS did for this project, newest first. Each model call shows the
 * model, what it was given, what it answered and its tokens; each code step shows what it computed and
 * which Observations it wrote. Nothing the AI does is hidden.
 */
export function Observatory({ steps, error, refreshable = true }: { steps: TraceStep[]; error?: string; refreshable?: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);

  if (error) {
    return (
      <p role="alert" className="flex items-center gap-2 border border-destructive/40 p-4 text-sm text-destructive">
        <AlertTriangle className="size-4" />The observatory could not load: {error}
      </p>
    );
  }

  const count = (f: Filter) => (f === "all" ? steps.length : f === "error" ? steps.filter((s) => s.status === "error").length : steps.filter((s) => s.kind === f).length);
  const shown = steps.filter((s) => filter === "all" || (filter === "error" ? s.status === "error" : s.kind === filter));
  const models = [...new Set(steps.flatMap((s) => (s.model ? [s.model] : [])))];
  const tokensIn = steps.reduce((n, s) => n + (s.tokensIn ?? 0), 0);
  const tokensOut = steps.reduce((n, s) => n + (s.tokensOut ?? 0), 0);
  const written = steps.reduce((n, s) => n + s.observations, 0);

  return (
    <div className="text-sm">
      <dl className="grid grid-cols-2 gap-px border bg-border sm:grid-cols-4">
        {[
          ["Model calls", String(count("model")), models.join(", ") || "none yet"],
          ["Tokens", `${tokensIn.toLocaleString("en")} in`, `${tokensOut.toLocaleString("en")} out`],
          ["Code steps · tools", `${count("code")} · ${count("tool")}`, "deterministic, no model"],
          ["Observations written", written.toLocaleString("en"), `${count("error")} failed steps`],
        ].map(([k, v, sub]) => (
          <div key={k} className="min-w-0 bg-background p-3">
            <dt className={label}>{k}</dt>
            <dd className="mt-1 font-mono text-lg tabular-nums">{v}</dd>
            <dd className="truncate font-mono text-[11px] text-muted-foreground">{sub}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {(["all", "model", "code", "tool", "error"] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn("border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider", filter === f ? "border-foreground text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {f === "all" ? "All" : f === "error" ? "Failed" : KIND[f].label} <span className="tabular-nums opacity-70">{count(f)}</span>
          </button>
        ))}
        {refreshable && (
          <button type="button" onClick={() => router.refresh()} className="ml-auto inline-flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
            <RefreshCw className="size-3.5" />Refresh
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="mt-3 border border-dashed p-6 text-center text-muted-foreground">
          {steps.length ? "Nothing matches this filter." : "Nothing has run yet. Every model call, code step and tool call for this project shows up here as it happens."}
        </p>
      ) : (
        <ol className="mt-3 border">
          {shown.map((s) => {
            const expanded = open === s.id;
            return (
              <li key={s.id} className="border-b last:border-b-0">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : s.id)}
                  className="grid w-full grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2 text-left hover:bg-muted/40"
                >
                  <ChevronRight className={cn("size-3.5 text-muted-foreground transition-transform", expanded && "rotate-90")} />
                  <span className={cn("w-14 border px-1.5 py-0.5 text-center font-mono text-[10px] uppercase tracking-wider", KIND[s.kind].tone)}>{KIND[s.kind].label}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-xs">
                      {s.name}
                      {s.status === "error" && <span className="ml-2 text-destructive">failed</span>}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {[s.subject, s.model, s.observations ? `${s.observations} observation${s.observations === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </span>
                  <span className="text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                    <span className="block" suppressHydrationWarning>{time(s.at)}</span>
                    <span className="block">
                      {ms(s.ms)}
                      {s.tokensIn != null && ` · ${s.tokensIn}→${s.tokensOut ?? 0} tok`}
                    </span>
                  </span>
                </button>
                {expanded && (
                  <div className="grid gap-3 border-t bg-card px-3 py-3 md:grid-cols-2">
                    <Json title="Input" value={s.input} />
                    {s.error ? (
                      <div className="min-w-0">
                        <p className={cn(label, "mb-1 text-destructive")}>Error</p>
                        <pre className="border border-destructive/40 p-2 font-mono text-[11px] whitespace-pre-wrap text-destructive">{s.error}</pre>
                      </div>
                    ) : (
                      <Json title="Output" value={s.output} />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-3 text-xs text-muted-foreground">Images are recorded by size only. Long text is cut at 1,200 characters. Model answers are proposals; numbers in products come from the code steps.</p>
    </div>
  );
}
