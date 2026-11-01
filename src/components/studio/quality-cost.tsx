"use client";

import { CircleAlert, PauseCircle } from "lucide-react";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { AGENT_LEVELS, money } from "@/lib/agent-levels";
import type { LaneAnalyzer } from "@/lib/lane-kinds";
import {
  budgetState, EVERY_CHOICES, FRAME_CAPS, laneAccuracy, laneCost, laneQuality, LANE_MODELS, modelOf, PRESETS, SIDE_CHOICES, SKIP_CHOICES, USES, VIDEO_FPS,
  type Budget, type CapMode, type LaneQuality, type Preset, type SamMode,
} from "@/lib/quality-cost";
import { ANALYZER_LABEL } from "@/lib/setup-rules";
import { cn } from "@/lib/utils";

/**
 * Quality & cost for a project: one preset, then each lane's sampling and one setting per model it calls,
 * with the bill and likely accuracy shown as the dials move. Shown in /design STU-12. Not in the studio yet,
 * and nothing is saved: the numbers are planning estimates for a typical piece of work in each lane.
 */

export type QualityLane = { id: string; name: string; analyzer: LaneAnalyzer; /** Typical minutes of video or audio per piece of work. */ minutes: number; note?: string };

const selectCls = "h-7 border bg-background px-1.5 font-mono text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40";
const label = "font-mono text-[10px] uppercase tracking-wider text-muted-foreground";

function Pick<T extends string | number>({ value, options, show, onChange, disabled, name }: { value: T; options: readonly T[]; show: (v: T) => string; onChange: (v: T) => void; disabled?: boolean; name: string }) {
  return (
    <select aria-label={name} className={selectCls} value={value} disabled={disabled} onChange={(e) => onChange((typeof value === "number" ? Number(e.target.value) : e.target.value) as T)}>
      {options.map((o) => <option key={o} value={o}>{show(o)}</option>)}
    </select>
  );
}

function LaneCard({ lane, q, onChange }: { lane: QualityLane; q: LaneQuality; onChange: (q: LaneQuality) => void }) {
  const cost = laneCost(q, lane);
  const accuracy = laneAccuracy(q);
  const set = (patch: Partial<LaneQuality>) => onChange({ ...q, ...patch });
  return (
    <section aria-label={`${lane.name} quality`} className="grid gap-3 border p-3">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h4 className="font-medium">{lane.name}</h4>
        <span className={label}>{ANALYZER_LABEL[lane.analyzer].name} · typical {lane.minutes} min</span>
        <span className="ml-auto font-mono text-xs"><span className="text-electric">{money(cost.total)}</span> per piece · ~{accuracy}% accurate · {cost.frames} frames sampled</span>
      </header>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <label className="flex items-center gap-1.5"><span className={label}>Frame every</span><Pick name="Frame every" value={q.every} options={EVERY_CHOICES} show={(s) => (s < 60 ? `${s} s` : "minute")} onChange={(every) => set({ every })} /></label>
        <label className="flex items-center gap-1.5"><span className={label}>Up to</span><Pick name="Most frames" value={q.maxFrames} options={FRAME_CAPS} show={(n) => `${n} frames`} onChange={(maxFrames) => set({ maxFrames })} /></label>
        <label className="flex items-center gap-1.5"><span className={label}>Picture size</span><Pick name="Picture size" value={q.side} options={SIDE_CHOICES} show={(p) => `${p}px`} onChange={(side) => set({ side })} /></label>
        <label className="flex items-center gap-1.5"><span className={label}>Look-alike frames</span><Pick name="Look-alike frames" value={q.skip} options={SKIP_CHOICES} show={(k) => (k === 0 ? "Read all" : `Skip about ${k * 100}%`)} onChange={(skip) => set({ skip })} /></label>
        {USES[lane.analyzer].includes("segment") && (
          <label className="flex items-center gap-1.5"><span className={label}>SAM reads</span>
            <Pick<SamMode> name="SAM reads" value={q.mode} options={["images", "video"]} show={(m) => (m === "images" ? "A picture per frame" : "The whole clip, tracked")} disabled={!q.models.segment.on} onChange={(mode) => set({ mode })} />
          </label>
        )}
      </div>
      {q.mode === "video" && q.models.segment.on && USES[lane.analyzer].includes("segment") && (
        <p className="text-[11px] text-chart-4">Whole-clip tracking is billed for every frame SAM processes, assumed {VIDEO_FPS} a second until a real run reports the count. It follows each object by its own id, so the same chair stays one object. Best for short clips.</p>
      )}

      <ul className="divide-y border text-xs">
        {LANE_MODELS.map((c) => {
          const m = modelOf(c);
          const uses = USES[lane.analyzer].includes(c);
          const s = q.models[c];
          return (
            <li key={c} className={cn("grid items-center gap-x-3 gap-y-1 px-2.5 py-2 @xl:grid-cols-[auto_minmax(0,1fr)_auto_4.5rem]", !uses && "opacity-50")}>
              <Switch size="sm" aria-label={`${m.family} on`} checked={uses && s.on} disabled={!uses} onCheckedChange={(on) => set({ models: { ...q.models, [c]: { ...s, on } } })} />
              <span className="min-w-0">
                <span className="block truncate"><span className="font-medium">{m.family}</span> <span className="font-mono text-[10px] text-muted-foreground">{m.id}</span></span>
                <span className="block truncate text-muted-foreground">{uses ? m.role : `A ${ANALYZER_LABEL[lane.analyzer].name.toLowerCase()} lane never calls this`}</span>
              </span>
              {c === "reason" ? (
                <Pick name={`${m.family} level`} value={s.level} options={AGENT_LEVELS.map((_, i) => i)} show={(i) => AGENT_LEVELS[i].name} disabled={!uses || !s.on} onChange={(level) => set({ models: { ...q.models, [c]: { ...s, level } } })} />
              ) : (
                <span className="font-mono text-[10px] text-muted-foreground">{c === "segment" ? "per concept" : "per minute"}</span>
              )}
              <span className="text-right font-mono">{uses && s.on ? money(cost.per[c]) : "off"}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function BudgetRow({ budget, onChange, estimate }: { budget: Budget; onChange: (b: Budget) => void; estimate: number }) {
  const { pct, state } = budgetState(budget);
  const over = state === "over";
  return (
    <section aria-label="Monthly budget" className={cn("grid gap-2 border p-3", over ? "border-destructive/60" : state === "near" && "border-chart-4/60")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <span className={label}>Monthly cap</span>
        <label className="flex items-center gap-1"><span className="text-muted-foreground">$</span>
          <input aria-label="Monthly cap in dollars" inputMode="decimal" placeholder="No cap" className={cn(selectCls, "w-20")} value={budget.cap ?? ""}
            onChange={(e) => { const n = Number(e.target.value); onChange({ ...budget, cap: e.target.value.trim() === "" || !(n > 0) ? null : n }); }} />
        </label>
        <label className="flex items-center gap-1.5"><span className={label}>At the cap</span>
          <Pick<CapMode> name="At the cap" value={budget.mode} options={["pause", "warn"]} show={(m) => (m === "pause" ? "Pause the project" : "Only warn me")} onChange={(mode) => onChange({ ...budget, mode })} disabled={budget.cap === null} />
        </label>
        <span className="ml-auto font-mono">{money(budget.spent)} spent{budget.cap !== null && <> of {money(budget.cap)}</>} · about {money(estimate)} more for one piece in every lane</span>
      </div>
      {budget.cap !== null && (
        <div role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Spent against the cap" className="h-1.5 bg-muted">
          <div className={cn("h-full", over ? "bg-destructive" : state === "near" ? "bg-chart-4" : "bg-signal")} style={{ width: `${Math.min(100, pct * 100)}%` }} />
        </div>
      )}
      {over && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          {budget.mode === "pause" ? <><PauseCircle className="size-3.5" />Cap reached: new reads are paused. Raise the cap to carry on; paused files show in Needs attention.</> : <><CircleAlert className="size-3.5" />Cap reached. Reads carry on because you chose to be warned only.</>}
        </p>
      )}
      {state === "near" && <p className="flex items-center gap-1.5 text-xs text-chart-4"><CircleAlert className="size-3.5" />{Math.round(pct * 100)}% of the cap is used.</p>}
    </section>
  );
}

/** The whole panel. `start` fixes the opening preset and budget; everything stays local until it is wired to a project. */
export function QualityCost({ lanes, start }: { lanes: QualityLane[]; start?: { preset?: number; budget?: Budget; mode?: SamMode; skip?: LaneQuality["skip"] } }) {
  const [preset, setPreset] = useState(start?.preset ?? 1);
  const [custom, setCustom] = useState(false);
  const [budget, setBudget] = useState<Budget>(start?.budget ?? { cap: null, mode: "pause", spent: 0 });
  const fresh = (p: Preset, first = false) => Object.fromEntries(lanes.map((l) => [l.id, { ...laneQuality(l.analyzer, p), ...(first ? { mode: start?.mode ?? "images", skip: start?.skip ?? 0 } : {}) }]));
  const [qs, setQs] = useState<Record<string, LaneQuality>>(() => fresh(PRESETS[start?.preset ?? 1], true));

  const totals = lanes.map((l) => laneCost(qs[l.id], l).total);
  const sum = totals.reduce((a, b) => a + b, 0);
  const lowest = Math.min(...lanes.map((l) => laneAccuracy(qs[l.id])).filter((n) => n > 0), 99);

  return (
    <div className="@container grid gap-3">
      <section aria-label="Preset" className="grid gap-2 border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={label}>Preset</span>
          {PRESETS.map((p, i) => (
            <button key={p.name} type="button" aria-pressed={!custom && preset === i} onClick={() => { setPreset(i); setCustom(false); setQs(fresh(p)); }}
              className={cn("border px-2.5 py-1 text-xs", !custom && preset === i ? "border-electric bg-electric/10 text-electric" : "hover:bg-muted")}>{p.name}</button>
          ))}
          {custom && <span className="font-mono text-[10px] text-chart-4">Custom · changed from {PRESETS[preset].name}</span>}
          <span className="ml-auto font-mono text-xs"><span className="text-electric">{money(sum)}</span> for one piece in every lane · weakest lane ~{lowest}% accurate</span>
        </div>
        <p className="text-xs text-muted-foreground">{PRESETS[preset].summary}. Pick a preset first; the lanes below only need touching when one deserves more or less than the rest.</p>
      </section>

      <BudgetRow budget={budget} onChange={setBudget} estimate={sum} />

      {lanes.length === 0 && <p className="border border-dashed p-4 text-center text-xs text-muted-foreground">No lanes yet. Each lane you add gets its own sampling and model settings here.</p>}
      {lanes.map((l) => <LaneCard key={l.id} lane={l} q={qs[l.id]} onChange={(q) => { setCustom(true); setQs((s) => ({ ...s, [l.id]: q })); }} />)}
    </div>
  );
}
