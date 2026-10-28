"use client";

import { Check, CircleAlert, Code2, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { LANE_ANALYZERS, type LaneAnalyzer } from "@/lib/lane-kinds";
import { ANALYZER_LABEL, canFeed, MAX_LANES, type SetupLane } from "@/lib/setup-rules";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * The pieces of AI setup, kept free of server calls so /design can show every state (PRJ-03).
 * The New project dialog holds the state and calls the model; these only draw it.
 */

const label = "font-mono text-[10px] uppercase tracking-wider text-muted-foreground";

export const GOAL_EXAMPLES = [
  "My abs and arms, one front and one side photo a day",
  "Where visitors get stuck on my website",
  "Cars, bikes and people passing my street",
];

export function GoalStep({ goal, onGoal, error }: { goal: string; onGoal: (g: string) => void; error?: string | null }) {
  return (
    <div className="p-6">
      <label htmlFor="setup-goal" className={label}>What do you want to track?</label>
      <Textarea id="setup-goal" autoFocus value={goal} onChange={(e) => onGoal(e.target.value)} placeholder="Say it in your own words. ARGUS suggests the data products and the lanes to feed them." maxLength={400} rows={3} className="mt-2 text-base" />
      <div className="mt-3 flex flex-wrap gap-2">
        {GOAL_EXAMPLES.map((g) => (
          <button key={g} type="button" onClick={() => onGoal(g)} className="border px-2.5 py-1 text-left text-xs text-muted-foreground hover:border-electric hover:text-foreground">{g}</button>
        ))}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** One line per AI or code step, so the person sees what is running. Names match the Observatory. */
export function Thinking({ steps, current }: { steps: { name: string; kind: "model" | "code"; text: string }[]; current: number }) {
  return (
    <ol className="grid gap-2 p-6" aria-live="polite">
      {steps.map((s, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <li key={s.name} className={cn("flex items-center gap-3 border px-3 py-2.5 text-sm transition-opacity", !done && !now && "opacity-40", now && "border-electric")}>
            <span className={cn("grid size-6 shrink-0 place-items-center border", done && "border-signal text-signal", now && "border-electric text-electric")}>
              {done ? <Check className="size-3.5" /> : now ? <Loader2 className="size-3.5 animate-spin" /> : s.kind === "model" ? <Sparkles className="size-3.5" /> : <Code2 className="size-3.5" />}
            </span>
            <span className="min-w-0 flex-1">{s.text}</span>
            <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">{s.kind} · {s.name}</span>
          </li>
        );
      })}
    </ol>
  );
}

export type ProductItem = { id: string; name: string; summary: string };

export function ProductPicks({ items, picks, picked, onToggle, name, onName }: { items: ProductItem[]; picks: { id: string; why: string }[]; picked: string[]; onToggle: (id: string) => void; name: string; onName: (n: string) => void }) {
  const suggested = picks.map((p) => ({ ...items.find((i) => i.id === p.id)!, why: p.why })).filter((p) => p.name);
  const rest = items.filter((i) => !picks.some((p) => p.id === i.id));
  return (
    <div className="grid gap-5 p-6">
      <div>
        <label htmlFor="setup-name" className={label}>Project name</label>
        <Input id="setup-name" value={name} onChange={(e) => onName(e.target.value)} placeholder="e.g. My body log" maxLength={80} className="mt-2 h-10 text-base" />
      </div>
      {suggested.length > 0 ? (
        <section>
          <h3 className={cn(label, "flex items-center gap-1.5")}><Sparkles className="size-3 text-electric" />ARGUS suggests</h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {suggested.map((p) => <ProductRow key={p.id} p={p} why={p.why} on={picked.includes(p.id)} onToggle={onToggle} />)}
          </ul>
        </section>
      ) : picks.length === 0 && (
        <p className="border border-dashed p-3 text-sm text-muted-foreground">Nothing in the catalog matched that goal well. Pick from the list below.</p>
      )}
      <section>
        <h3 className={label}>{suggested.length ? "Everything else" : "All data products"}</h3>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((p) => <ProductRow key={p.id} p={p} on={picked.includes(p.id)} onToggle={onToggle} small />)}
        </ul>
      </section>
    </div>
  );
}

function ProductRow({ p, why, on, onToggle, small }: { p: ProductItem; why?: string; on: boolean; onToggle: (id: string) => void; small?: boolean }) {
  return (
    <li>
      <button type="button" aria-pressed={on} onClick={() => onToggle(p.id)} className={cn("flex h-full w-full items-start gap-3 border p-3 text-left hover:bg-accent/30", on && "outline outline-2 -outline-offset-2 outline-electric")}>
        <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center border", on && "border-electric bg-electric text-background")}>{on && <Check className="size-3.5" />}</span>
        <span className="min-w-0">
          <span className={cn("block font-medium", small && "text-sm")}>{p.name}</span>
          <span className={cn("mt-0.5 block text-muted-foreground", small ? "line-clamp-2 text-xs" : "text-sm")}>{why ?? p.summary}</span>
        </span>
      </button>
    </li>
  );
}

/** The lanes the AI planned, each with the products it feeds. Every edit is checked again by the same code. */
export function LanePlan({ lanes, onChange, items, picked, problems, attempts }: { lanes: SetupLane[]; onChange: (l: SetupLane[]) => void; items: ProductItem[]; picked: string[]; problems: string[]; attempts?: number }) {
  const nameOf = (id: string) => items.find((i) => i.id === id)?.name ?? id;
  const set = (i: number, patch: Partial<SetupLane>) => onChange(lanes.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div className="grid gap-3 p-6">
      <p className="text-sm text-muted-foreground">
        Each lane is one kind of file you add again and again. ARGUS planned these and linked each one to the products it feeds{attempts && attempts > 1 ? `; the code check sent the first plan back, so it took ${attempts} tries` : ""}. Change anything before you create the project.
      </p>
      <ul className="grid gap-3 lg:grid-cols-2">
        {lanes.map((l, i) => (
          <li key={i} className="grid gap-2 border p-3">
            <div className="flex items-center gap-2">
              <Input aria-label="Lane name" value={l.name} onChange={(e) => set(i, { name: e.target.value })} maxLength={60} placeholder="Lane name" className="h-9 font-medium" />
              <button type="button" aria-label={`Remove lane ${l.name}`} onClick={() => onChange(lanes.filter((_, j) => j !== i))} className="grid size-9 shrink-0 place-items-center border text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
            </div>
            <Textarea aria-label="What these files are" value={l.note} onChange={(e) => set(i, { note: e.target.value })} maxLength={300} rows={2} placeholder="What these files are, for the AI" className="text-sm" />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={label}>Reads with</span>
              {LANE_ANALYZERS.map((a) => (
                <button key={a} type="button" aria-pressed={l.analyzer === a} title={ANALYZER_LABEL[a].does} onClick={() => set(i, { analyzer: a, feeds: l.feeds.filter((id) => canFeed(a, id)) })} className={cn("border px-2 py-0.5 text-xs", l.analyzer === a ? "border-electric text-electric" : "text-muted-foreground hover:text-foreground")}>{ANALYZER_LABEL[a].name}</button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{ANALYZER_LABEL[l.analyzer].files}: {ANALYZER_LABEL[l.analyzer].does}.</p>
            <div className="flex flex-wrap items-center gap-1.5 border-t pt-2">
              <span className={label}>Feeds</span>
              {picked.filter((id) => canFeed(l.analyzer, id)).map((id) => {
                const on = l.feeds.includes(id);
                return (
                  <button key={id} type="button" aria-pressed={on} onClick={() => set(i, { feeds: on ? l.feeds.filter((x) => x !== id) : [...l.feeds, id] })} className={cn("inline-flex items-center gap-1 border px-2 py-0.5 text-xs", on ? "border-signal text-foreground" : "border-dashed text-muted-foreground")}>
                    {on ? <Check className="size-3 text-signal" /> : <Plus className="size-3" />}{nameOf(id)}
                  </button>
                );
              })}
              {!picked.some((id) => canFeed(l.analyzer, id)) && <span className="text-xs text-muted-foreground">None of the picked products read this.</span>}
            </div>
          </li>
        ))}
        {lanes.length < MAX_LANES && (
          <li>
            <button type="button" onClick={() => onChange([...lanes, { name: "", note: "", analyzer: firstNeeded(picked, lanes), feeds: [] }])} className="flex h-full min-h-24 w-full items-center justify-center gap-2 border border-dashed text-sm text-muted-foreground hover:border-electric hover:text-foreground"><Plus className="size-4" />Add a lane</button>
          </li>
        )}
      </ul>
      {problems.length > 0 && (
        <div role="alert" className="grid gap-1 border border-destructive/50 p-3 text-sm">
          <span className="flex items-center gap-1.5 font-medium text-destructive"><CircleAlert className="size-4" />The code check found {problems.length === 1 ? "a problem" : `${problems.length} problems`}</span>
          <ul className="list-disc pl-5 text-muted-foreground">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

/** A new lane starts on the analyzer of a picked product nothing feeds yet. */
function firstNeeded(picked: string[], lanes: SetupLane[]): LaneAnalyzer {
  for (const a of LANE_ANALYZERS) if (picked.some((id) => canFeed(a, id) && !lanes.some((l) => l.feeds.includes(id)))) return a;
  return LANE_ANALYZERS.find((a) => picked.some((id) => canFeed(a, id))) ?? "objects";
}
