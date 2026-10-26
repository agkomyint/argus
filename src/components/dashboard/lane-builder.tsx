"use client";

import { useState, useTransition } from "react";
import { saveLanes } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { pickLane, type Lane } from "@/lib/agent-config";
import { cn } from "@/lib/utils";

const PRESETS: { name: string; blurb: string; lanes: Omit<Lane, "id">[] }[] = [
  {
    name: "Fast and careful",
    blurb: "Strong findings get the full AI review at Maximum. Middling ones get a free rules-only flag.",
    lanes: [
      { name: "Careful", enabled: true, from: 0.8, to: 1, recipe: "full", level: 4 },
      { name: "Quick flag", enabled: true, from: 0.5, to: 0.8, recipe: "quick", level: null },
    ],
  },
  {
    name: "Save money",
    blurb: "Only the strongest findings spend model calls. Everything else is a rules-only flag.",
    lanes: [
      { name: "Worth a brief", enabled: true, from: 0.85, to: 1, recipe: "full", level: null },
      { name: "Rules only", enabled: true, from: 0.3, to: 0.85, recipe: "quick", level: null },
    ],
  },
];

const RECIPE = { full: "Full review (AI brief + claim check)", quick: "Quick flag (rules only, no AI cost)" } as const;

export function LaneBuilder({ initial, confidences, levels }: { initial: Lane[]; confidences: number[]; levels: string[] }) {
  const [lanes, setLanes] = useState<Lane[]>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const dirty = JSON.stringify(lanes) !== JSON.stringify(initial);

  const edit = (id: string, patch: Partial<Lane>) => {
    setMsg(null);
    setLanes((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };
  const add = (l: Omit<Lane, "id">) => setLanes((ls) => (ls.length >= 4 ? ls : [...ls, { ...l, id: crypto.randomUUID() }]));

  const routed = new Map<string, number>();
  let standard = 0;
  for (const c of confidences) {
    const l = pickLane(lanes, c);
    if (l) routed.set(l.id, (routed.get(l.id) ?? 0) + 1);
    else standard++;
  }

  return (
    <div className="border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          Split the line by how sure Perception was. Each lane has its own recipe and cost level, and lanes run side by side. A finding goes to the first lane that fits; the rest use the standard line above.
        </p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button key={p.name} variant="outline" size="sm" title={p.blurb} onClick={() => { setMsg(null); setLanes(p.lanes.map((l) => ({ ...l, id: crypto.randomUUID() }))); }}>
              {p.name}
            </Button>
          ))}
        </div>
      </div>

      <ul className="mt-5 grid gap-3 lg:grid-cols-2">
        {lanes.map((l, i) => (
          <li key={l.id} className={cn("border p-4", !l.enabled && "opacity-60")}>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Lane {i + 1}</span>
              <input
                value={l.name}
                maxLength={30}
                aria-label="Lane name"
                onChange={(e) => edit(l.id, { name: e.target.value })}
                className="min-w-0 flex-1 border-b bg-transparent text-sm font-medium outline-none focus:border-electric"
              />
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <input type="checkbox" checked={l.enabled} onChange={(e) => edit(l.id, { enabled: e.target.checked })} /> on
              </label>
              <button type="button" aria-label="Remove lane" onClick={() => { setMsg(null); setLanes((ls) => ls.filter((x) => x.id !== l.id)); }} className="px-1 text-muted-foreground hover:text-destructive">×</button>
            </div>

            <div className="mt-4 text-sm">
              <div className="flex justify-between"><span>Confidence from</span><span className="font-mono text-xs text-electric">{l.from.toFixed(2)} to {l.to.toFixed(2)}</span></div>
              <input type="range" min={0} max={0.95} step={0.05} value={l.from} aria-label="From" onChange={(e) => { const v = Number(e.target.value); edit(l.id, { from: v, to: Math.max(l.to, v + 0.05) }); }} className="mt-1 w-full accent-[var(--electric)]" />
              <input type="range" min={0.05} max={1} step={0.05} value={l.to} aria-label="To" onChange={(e) => { const v = Number(e.target.value); edit(l.id, { to: v, from: Math.min(l.from, v - 0.05) }); }} className="w-full accent-[var(--electric)]" />
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {(Object.keys(RECIPE) as (keyof typeof RECIPE)[]).map((r) => (
                <button key={r} type="button" aria-pressed={l.recipe === r} onClick={() => edit(l.id, { recipe: r })} className={cn("border px-2.5 py-1", l.recipe === r ? "border-electric text-electric" : "text-muted-foreground hover:text-foreground")}>
                  {RECIPE[r]}
                </button>
              ))}
            </div>

            {l.recipe === "full" && (
              <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                Cost level
                <select value={l.level ?? ""} onChange={(e) => edit(l.id, { level: e.target.value === "" ? null : Number(e.target.value) })} className="border bg-background px-2 py-1 text-foreground">
                  <option value="">Follow project level</option>
                  {levels.map((n, k) => <option key={n} value={k}>{n}</option>)}
                </select>
              </label>
            )}

            <p className="mt-3 font-mono text-[11px] text-muted-foreground">{routed.get(l.id) ?? 0} of your {confidences.length} past findings would land here</p>
          </li>
        ))}

        <li className="border border-dashed p-4">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Standard line</span>
          <p className="mt-2 text-sm">Everything no lane catches runs the five stations above.</p>
          <p className="mt-3 font-mono text-[11px] text-muted-foreground">{standard} of {confidences.length} past findings</p>
        </li>
      </ul>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled={lanes.length >= 4} onClick={() => add({ name: `Lane ${lanes.length + 1}`, enabled: true, from: 0.5, to: 1, recipe: "full", level: null })}>Add lane</Button>
        <Button
          disabled={!dirty || pending}
          onClick={() => start(async () => {
            const r = await saveLanes(lanes);
            setMsg(r.error ?? "Saved. New findings are routed by these lanes.");
          })}
        >
          {pending ? "Saving…" : "Save lanes"}
        </Button>
        {msg && <span role="status" className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
}
