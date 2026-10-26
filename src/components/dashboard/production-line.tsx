"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { resetAgentConfig, saveAgentConfig } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { DEFAULT_CONFIG, type AgentConfig, type AgentId } from "@/lib/agent-config";
import { severityOf, type SeverityInput } from "@/lib/severity";
import { cn } from "@/lib/utils";

export type Material = { label: string; count: number; unit: string; href: string };
export type Good = { label: string; count: number; unit: string; href: string };
export type Station = {
  id: AgentId;
  name: string;
  kind: "code" | "model";
  job: string;
  takes: string;
  makes: string;
  runs: number;
  avgMs: number;
  inFlight: number;
  sample: { input: unknown; output: unknown; ms: number } | null;
};
export type ReplayCase = { id: string; title: string; stored: "low" | "medium" | "high"; input: SeverityInput };

const SEV = { low: "text-signal", medium: "text-electric", high: "text-destructive" } as const;

export function ProductionLine(props: {
  materials: Material[];
  stations: Station[];
  goods: Good[];
  config: AgentConfig;
  levelDefaults: { maxClaims: number; strict: boolean; name: string };
  confidences: number[];
  replay: ReplayCase[];
}) {
  const { materials, stations, goods, config, levelDefaults, confidences, replay } = props;
  const [selected, setSelected] = useState<AgentId>("perception");
  const [draft, setDraft] = useState<AgentConfig>(config);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const dirty = (id: AgentId) => JSON.stringify(draft[id]) !== JSON.stringify(config[id]);
  const custom = (id: AgentId) => JSON.stringify(config[id]) !== JSON.stringify(DEFAULT_CONFIG[id]);
  const set = <K extends AgentId>(id: K, patch: Partial<AgentConfig[K]>) => {
    setMsg(null);
    setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  };
  const st = stations.find((s) => s.id === selected)!;

  return (
    <div>
      {/* The line itself: raw material in, stations in the middle, finished goods out. */}
      <div className="grid gap-px border bg-border lg:grid-cols-[13rem_1fr_13rem]">
        <div className="bg-background p-4">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Raw material</p>
          <ul className="mt-3 space-y-2">
            {materials.map((m) => (
              <li key={m.label}>
                <Link href={m.href} className="flex items-baseline justify-between gap-2 text-sm hover:underline">
                  <span>{m.label}</span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">{m.count} {m.unit}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-background p-4">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Stations, left to right</p>
          <ol className="mt-3 grid gap-2 sm:grid-cols-5">
            {stations.map((s, i) => (
              <li key={s.id} className="relative">
                <button
                  type="button"
                  onClick={() => setSelected(s.id)}
                  aria-pressed={selected === s.id}
                  className={cn("flex h-full w-full flex-col border p-3 text-left hover:bg-accent/40", selected === s.id && "border-electric bg-accent/60")}
                >
                  <span className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {i + 1}
                    <span className={cn("size-2", s.inFlight ? "animate-pulse bg-electric" : s.kind === "model" ? "bg-electric" : "bg-signal")} />
                  </span>
                  <span className="mt-1 text-sm font-medium">{s.name}</span>
                  <span className="text-[11px] text-muted-foreground">{s.kind === "model" ? "Meta model" : "code rules"}</span>
                  <span className="mt-2 font-mono text-[11px] text-muted-foreground">{s.runs} run{s.runs === 1 ? "" : "s"}{s.runs > 0 && s.avgMs > 0 ? ` · ${s.avgMs}ms` : ""}</span>
                  {(custom(s.id) || dirty(s.id)) && <span className="mt-1 font-mono text-[10px] uppercase tracking-wider text-electric">{dirty(s.id) ? "unsaved" : "tuned"}</span>}
                </button>
                {i < stations.length - 1 && <span aria-hidden className="absolute -right-2 top-1/2 z-10 hidden -translate-y-1/2 font-mono text-xs text-muted-foreground sm:block">→</span>}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">Each job moves left to right. A station only passes on what it can back up, and a person signs off every alert at the end.</p>
        </div>

        <div className="bg-background p-4">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Finished goods</p>
          <ul className="mt-3 space-y-2">
            {goods.length === 0 && <li className="text-sm text-muted-foreground">Turn on a data product.</li>}
            {goods.map((g) => (
              <li key={g.label}>
                <Link href={g.href} className="flex items-baseline justify-between gap-2 text-sm hover:underline">
                  <span>{g.label}</span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">{g.count} {g.unit}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* The selected station: what it does, how it decides, and the dials. */}
      <div className="mt-6 grid gap-8 border p-5 lg:grid-cols-2">
        <div>
          <h3 className="text-lg font-medium">{st.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{st.job}</p>
          <dl className="mt-4 space-y-3 text-sm">
            <div><dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Takes in</dt><dd>{st.takes}</dd></div>
            <div><dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Hands on</dt><dd>{st.makes}</dd></div>
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Rule right now</dt>
              <dd>{ruleText(selected, draft, levelDefaults)}</dd>
            </div>
          </dl>
          {st.sample ? (
            <details className="mt-4">
              <summary className="cursor-pointer font-mono text-[11px] text-muted-foreground hover:text-foreground">Latest real run, {st.sample.ms}ms</summary>
              <div className="mt-2 grid gap-3">
                <Pre label="Received" value={st.sample.input} />
                <Pre label="Produced" value={st.sample.output} />
              </div>
            </details>
          ) : (
            <p className="mt-4 text-xs text-muted-foreground">No recorded run for this station yet.</p>
          )}
        </div>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Dials</p>
          <div className="mt-3 space-y-5">
            {selected === "perception" && (
              <Slider label="Investigate findings at or above" value={draft.perception.minConfidence} min={0.3} max={0.95} step={0.05} fmt={(v) => v.toFixed(2)} onChange={(v) => set("perception", { minConfidence: v })}
                hint="Findings below this are still saved as observations, but no investigation starts." />
            )}
            {selected === "correlation" && (
              <Slider label="Look this far either side of the finding" value={draft.correlation.windowMinutes} min={15} max={240} step={15} fmt={(v) => `${v} min`} onChange={(v) => set("correlation", { windowMinutes: v })}
                hint="A wider window joins more readings but can pull in unrelated ones." />
            )}
            {selected === "analysis" && (
              <>
                <Slider label="Vibration counts as high above" value={draft.analysis.vibrationRatio} min={1.1} max={3} step={0.1} fmt={(v) => `${v.toFixed(1)}x baseline`} onChange={(v) => set("analysis", { vibrationRatio: v })} />
                <Slider label="Rain counts as heavy above" value={draft.analysis.rainMm} min={2} max={50} step={1} fmt={(v) => `${v} mm / 24h`} onChange={(v) => set("analysis", { rainMm: v })} />
                <Slider label="Medium severity from score" value={draft.analysis.mediumAt} min={1} max={6} step={1} fmt={String} onChange={(v) => set("analysis", { mediumAt: v })} />
                <Slider label="High severity from score" value={draft.analysis.highAt} min={2} max={7} step={1} fmt={String} onChange={(v) => set("analysis", { highAt: v })} hint="High must be above Medium." />
              </>
            )}
            {selected === "reasoning" && (
              <label className="block text-sm">
                <span className="font-medium">Style guidance for the brief</span>
                <textarea
                  value={draft.reasoning.guidance}
                  maxLength={300}
                  rows={4}
                  onChange={(e) => set("reasoning", { guidance: e.target.value })}
                  placeholder="For example: write for a site manager, avoid jargon, lead with what to do."
                  className="mt-2 w-full border bg-background p-2 text-sm"
                />
                <span className="text-xs text-muted-foreground">{draft.reasoning.guidance.length}/300. Changes tone and emphasis only. It cannot change severity or the claim checks.</span>
              </label>
            )}
            {selected === "verification" && (
              <>
                <Choice label="Claims allowed per brief" value={draft.verification.maxClaims} options={[null, 2, 3, 4, 6, 8]} fmt={(v) => (v === null ? `Follow level (${levelDefaults.maxClaims})` : String(v))} onChange={(v) => set("verification", { maxClaims: v })} />
                <Choice label="Strict number check" value={draft.verification.strict} options={[null, true, false]} fmt={(v) => (v === null ? `Follow level (${levelDefaults.strict ? "on" : "off"})` : v ? "On" : "Off")} onChange={(v) => set("verification", { strict: v })} />
              </>
            )}
          </div>

          <Effect id={selected} draft={draft} saved={config} confidences={confidences} replay={replay} />

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button
              disabled={!dirty(selected) || pending}
              onClick={() => start(async () => {
                const r = await saveAgentConfig(selected, draft[selected]);
                setMsg(r.error ?? "Saved. New jobs use these settings.");
              })}
            >
              {pending ? "Saving…" : "Save station"}
            </Button>
            <Button
              variant="outline"
              disabled={pending || JSON.stringify(draft[selected]) === JSON.stringify(DEFAULT_CONFIG[selected])}
              onClick={() => start(async () => {
                await resetAgentConfig(selected);
                setDraft((d) => ({ ...d, [selected]: DEFAULT_CONFIG[selected] }));
                setMsg("Back to the default.");
              })}
            >
              Reset to default
            </Button>
            {msg && <span role="status" className="text-sm text-muted-foreground">{msg}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ruleText(id: AgentId, c: AgentConfig, lvl: { maxClaims: number; strict: boolean; name: string }) {
  switch (id) {
    case "perception":
      return `Reads each photo or frame and lists what is visible with a confidence. A finding at ${c.perception.minConfidence.toFixed(2)} or higher starts an investigation; the strongest one per photo.`;
    case "correlation":
      return `Joins vibration, weather and inspection history for the same asset within ${c.correlation.windowMinutes} minutes of the finding, by event time.`;
    case "analysis":
      return `Adds points: confidence 0.80+ is 2, 0.50+ is 1; vibration over ${c.analysis.vibrationRatio.toFixed(1)}x is 2; rain over ${c.analysis.rainMm} mm is 1; a past rating of 3 or less is 1. Score ${c.analysis.mediumAt}+ is medium, ${c.analysis.highAt}+ is high.`;
    case "reasoning":
      return `Drafts the brief from the facts only, up to ${c.verification.maxClaims ?? lvl.maxClaims} claims at the ${lvl.name} level.${c.reasoning.guidance.trim() ? " Your style guidance is added." : ""}`;
    case "verification":
      return `Keeps at most ${c.verification.maxClaims ?? lvl.maxClaims} claims. Drops any that cite nothing, cite an unknown observation, or quote a number not in the facts${(c.verification.strict ?? lvl.strict) ? ", or mention digits without listing them" : ""}.`;
  }
}

/** What the draft would have changed, measured on this project's own history. */
function Effect({ id, draft, saved, confidences, replay }: { id: AgentId; draft: AgentConfig; saved: AgentConfig; confidences: number[]; replay: ReplayCase[] }) {
  if (id === "perception") {
    const was = confidences.filter((c) => c >= saved.perception.minConfidence).length;
    const now = confidences.filter((c) => c >= draft.perception.minConfidence).length;
    return <Note>On {confidences.length} past finding{confidences.length === 1 ? "" : "s"}: {was} investigated now, {now} with this setting.</Note>;
  }
  if (id === "analysis") {
    if (!replay.length) return <Note>No past alerts to replay yet.</Note>;
    const rows = replay.map((r) => ({ r, now: severityOf(r.input, draft.analysis).level }));
    const changed = rows.filter((x) => x.now !== x.r.stored).length;
    return (
      <div className="mt-5 border">
        <p className="border-b p-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Replay on your last {rows.length} alerts · {changed} would change</p>
        <ul>
          {rows.map(({ r, now }) => (
            <li key={r.id} className="grid grid-cols-[1fr_auto] gap-3 border-b px-3 py-2 text-xs last:border-b-0">
              <span className="truncate">{r.title}</span>
              <span className="font-mono">
                <span className={SEV[r.stored]}>{r.stored}</span>
                {now !== r.stored && <> → <span className={SEV[now]}>{now}</span></>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (id === "correlation") return <Note>Takes effect on the next investigation. Past alerts keep the window they were made with.</Note>;
  if (id === "reasoning") return <Note>Takes effect on the next brief. The model still cannot set severity.</Note>;
  return <Note>Takes effect on the next brief. Stricter checks reject more claims.</Note>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-5 border-l-2 border-electric pl-3 text-sm text-muted-foreground">{children}</p>;
}

function Slider({ label, value, min, max, step, fmt, onChange, hint }: { label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="flex items-baseline justify-between"><span className="font-medium">{label}</span><span className="font-mono text-xs text-electric">{fmt(value)}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full accent-[var(--electric)]" />
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Choice<T extends number | boolean | null>({ label, value, options, fmt, onChange }: { label: string; value: T; options: T[]; fmt: (v: T) => string; onChange: (v: T) => void }) {
  return (
    <div className="text-sm">
      <p className="font-medium">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={String(o)} type="button" aria-pressed={o === value} onClick={() => onChange(o)} className={cn("border px-2.5 py-1 font-mono text-xs", o === value ? "border-electric text-electric" : "text-muted-foreground hover:text-foreground")}>{fmt(o)}</button>
        ))}
      </div>
    </div>
  );
}

function Pre({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <pre className="mt-1 max-h-48 overflow-auto bg-muted p-3 text-[11px] leading-relaxed">{value === undefined ? "not recorded" : JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}
