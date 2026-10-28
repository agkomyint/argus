"use client";

import { useState } from "react";
import { Empty } from "@/components/widgets/empty";
import { personaColor, personaLabel, SEVERITY, severityOf, SEVERITY_TONE, stat, type Severity } from "@/widgets/library/persona-kit";
import { rowKeys } from "@/widgets/kit";
import type { WidgetProps } from "@/widgets/schema";

/** Every place a simulated visitor got stuck, worst first. Filter by severity to triage. */
export function FrictionLog({ rows, size, settings }: WidgetProps) {
  const [only, setOnly] = useState<Severity | null>(null);
  const issues = rows.filter((r) => typeof r.issue === "string" && r.issue);
  if (!issues.length) return <Empty text="No friction reported yet." />;

  const counts = Object.fromEntries(SEVERITY.map((s) => [s, issues.filter((r) => severityOf(r) === s).length])) as Record<Severity, number>;

  if (size === "compact") {
    return (
      <div className="grid h-full grid-cols-3 items-end gap-2 px-3 pb-2 pt-7">
        {SEVERITY.map((s) => (
          <div key={s} className="min-w-0">
            <p className="font-mono text-xl tabular-nums" style={{ color: SEVERITY_TONE[s] }}>{counts[s]}</p>
            <p className={stat}>{s}</p>
          </div>
        ))}
      </div>
    );
  }

  const rank = (s: Severity) => SEVERITY.indexOf(s);
  const shown = issues
    .filter((r) => !only || severityOf(r) === only)
    .sort((a, b) => rank(severityOf(a)) - rank(severityOf(b)) || b.t - a.t)
    .slice(0, Number(settings.limit) || 40);
  const keys = rowKeys(shown, (r) => [r.persona, r.label]);

  return (
    <div className="@container h-full overflow-auto [scrollbar-gutter:stable]">
      <div className="grid gap-3">
        <div className="grid grid-cols-3 gap-px border bg-border">
          {SEVERITY.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={only === s}
              onClick={() => setOnly(only === s ? null : s)}
              className={`bg-background px-3 py-2.5 text-left transition-colors hover:bg-muted/50 ${only && only !== s ? "opacity-50" : ""}`}
            >
              <span className={`${stat} flex items-center gap-1.5`}><span className="size-2 rotate-45" style={{ background: SEVERITY_TONE[s] }} />{s}</span>
              <span className="block font-mono text-xl tabular-nums">{counts[s]}</span>
            </button>
          ))}
        </div>

        <ul className="divide-y border">
          {shown.map((r, i) => {
            const sev = severityOf(r);
            return (
              <li key={keys[i]} className="flex items-start gap-2.5 px-3 py-2.5 transition-[opacity,transform] duration-500 starting:-translate-y-1 starting:opacity-0">
                <span className="mt-1.5 size-2 shrink-0 rotate-45" style={{ background: SEVERITY_TONE[sev] }} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
                    <span className="font-medium">{String(r.label ?? "Element")}</span>
                    <span className="truncate font-mono text-[10px] text-muted-foreground">{String(r.screen ?? r.page ?? "")}</span>
                  </p>
                  <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{String(r.issue)}</p>
                </div>
                <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="size-1.5 rounded-full" style={{ background: personaColor(r.persona) }} />
                  <span className="hidden @md:inline">{personaLabel(r)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
