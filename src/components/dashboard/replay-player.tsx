"use client";

import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentState } from "@/components/design/agent-kit";
import { EngineMap, type EngineNode } from "@/components/design/engine-map";
import { Button } from "@/components/ui/button";
import type { ReplayData } from "@/lib/replay";
import { cn } from "@/lib/utils";

/** Seconds a full replay takes at 1×, however long the project has existed. */
const PLAY_SECONDS = 45;
const SPEEDS = [0.5, 1, 2, 4] as const;
const label = "font-mono text-[10px] uppercase tracking-wider text-muted-foreground";

const when = (t: number, withDay = true) =>
  new Date(t).toLocaleString("en", withDay ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false } : { hour: "2-digit", minute: "2-digit", hour12: false });

/** The engine at one moment: which parts existed, what was running, and how many rows had landed. */
function engineAt(d: ReplayData, t: number, pulse: number) {
  const alive = (id: string) => d.born[id] <= t;
  const c = new Map<string, { done: number; failed: number; active: number }>();
  for (const j of d.jobs) {
    if (j.from > t) continue;
    // A job that took a moment still glows for a beat after it ends, so it can be seen on the clock.
    const until = j.to === null ? Infinity : Math.max(j.to, j.from) + pulse / 2;
    for (const n of j.nodes) {
      const x = c.get(n) ?? { done: 0, failed: 0, active: 0 };
      if (t < until) x.active++;
      else if (j.failed) x.failed++;
      else x.done++;
      c.set(n, x);
    }
  }
  const rows = (id: string) => (d.arrivals[id] ?? []).reduce((a, [at, n]) => (at <= t ? a + n : a), 0);
  const fresh = (id: string) => (d.arrivals[id] ?? []).some(([at]) => at <= t && t - at < pulse);
  const of = (x?: { done: number; failed: number; active: number }): AgentState => (!x ? "waiting" : x.active ? "working" : x.failed ? "error" : x.done ? "done" : "waiting");

  const state = new Map<string, AgentState>();
  const nodes: EngineNode[] = [];
  for (const n of d.nodes) {
    if (!alive(n.id)) continue;
    let s: AgentState;
    let rate: string | undefined;
    if (n.col <= 2) {
      const x = c.get(n.id);
      s = of(x);
      rate = x ? `${x.done} done${x.failed ? ` · ${x.failed} failed` : ""}${x.active ? ` · ${x.active} running` : ""}` : "nothing yet";
    } else if (n.col === 3) {
      const r = rows(n.id);
      const up = d.edges.filter(([, to]) => to === n.id).map(([from]) => state.get(from));
      s = up.includes("working") || fresh(n.id) ? "working" : r ? "done" : "waiting";
      rate = `${r.toLocaleString("en-US")} rows`;
    } else {
      const feeds = d.feeds[n.id] ?? [];
      const r = feeds.reduce((a, l) => a + rows(l), 0);
      const up = feeds.map((l) => state.get(l));
      s = up.includes("working") ? "working" : r ? "done" : "waiting";
      rate = n.rate === undefined ? undefined : `${r.toLocaleString("en-US")} rows`;
    }
    state.set(n.id, s);
    nodes.push({ ...n, state: s, rate });
  }
  const edges = d.edges.filter(([a, b]) => state.has(a) && state.has(b));
  return { nodes, edges, busy: [...state.values()].some((s) => s === "working") };
}

/**
 * Plays a project back from the day it was made until now. Drag the scrubber or press play;
 * quiet stretches are skipped so a project that ran for weeks still plays in under a minute.
 */
export function ReplayPlayer({ data }: { data: ReplayData }) {
  const span = data.end - data.start;
  const pulse = Math.max(span / 160, 4_000);
  const [t, setT] = useState(data.end);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [skipQuiet, setSkipQuiet] = useState(true);
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);

  const marks = useMemo(() => [...new Set(data.events.map((e) => e.t))].sort((a, b) => a - b), [data.events]);
  const view = useMemo(() => engineAt(data, t, pulse), [data, t, pulse]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      let next = tRef.current + (dt / 1000) * (span / PLAY_SECONDS) * speed;
      if (skipQuiet && !engineAt(data, next, pulse).busy) {
        // Nothing running: jump to just before the next thing that happens.
        const upcoming = marks.find((m) => m > next);
        const jobSoon = data.jobs.find((j) => j.from > next)?.from;
        const target = Math.min(upcoming ?? Infinity, jobSoon ?? Infinity);
        const lead = (span / PLAY_SECONDS) * 0.6;
        if (Number.isFinite(target) && target - next > lead * 2) next = target - lead;
      }
      if (next >= data.end) {
        setT(data.end);
        setPlaying(false);
        return;
      }
      setT(next);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, skipQuiet, span, pulse, marks, data]);

  const play = () => {
    if (t >= data.end) setT(data.start);
    setPlaying((p) => !p);
  };
  const jump = (dir: 1 | -1) => {
    setPlaying(false);
    const m = dir > 0 ? marks.find((x) => x > t + 1) : [...marks].reverse().find((x) => x < t - 1);
    setT(m ?? (dir > 0 ? data.end : data.start));
  };

  const past = data.events.filter((e) => e.t <= t);
  const log = past.slice(-14).reverse();
  const pct = (x: number) => `${((x - data.start) / span) * 100}%`;
  const atEnd = t >= data.end;

  return (
    <div className="space-y-4">
      <div className="border">
        <div className="flex flex-wrap items-center gap-3 border-b p-3">
          <Button size="icon" onClick={play} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
          <Button size="icon" variant="outline" onClick={() => jump(-1)} aria-label="Previous event"><SkipBack className="size-4" /></Button>
          <Button size="icon" variant="outline" onClick={() => jump(1)} aria-label="Next event"><SkipForward className="size-4" /></Button>
          <div className="min-w-0">
            <p className={label}>{atEnd ? "Now" : playing ? "Playing" : "Paused at"}</p>
            <p className="font-mono text-sm tabular-nums" suppressHydrationWarning>{when(t)}</p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={skipQuiet} onChange={(e) => setSkipQuiet(e.target.checked)} className="accent-electric" />
              Skip quiet time
            </label>
            <div className="flex border" role="group" aria-label="Speed">
              {SPEEDS.map((s) => (
                <button key={s} type="button" onClick={() => setSpeed(s)} aria-pressed={speed === s} className={cn("px-2 py-1 font-mono text-[11px] tabular-nums", speed === s ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
                  {s}×
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Scrubber: event ticks above, the played part filled, time labels at the ends. */}
        <div className="px-3 pb-2 pt-3">
          <div className="relative h-3">
            {marks.map((m) => (
              <span key={m} className={cn("absolute top-0 h-3 w-px", m <= t ? "bg-electric" : "bg-border")} style={{ left: pct(m) }} />
            ))}
          </div>
          <input
            type="range"
            min={data.start}
            max={data.end}
            step={Math.max(1, Math.round(span / 2000))}
            value={t}
            onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }}
            aria-label="Replay position"
            className="w-full accent-electric"
          />
          <div className="flex justify-between font-mono text-[10px] text-muted-foreground tabular-nums" suppressHydrationWarning>
            <span suppressHydrationWarning>Started {when(data.start)}</span>
            <span suppressHydrationWarning>Now {when(data.end)}</span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="min-w-0 overflow-x-auto border p-3">
          {view.nodes.length ? (
            <EngineMap nodes={view.nodes} edges={view.edges} />
          ) : (
            <p className="p-10 text-center text-sm text-muted-foreground">Nothing set up yet at this point. Press play.</p>
          )}
        </div>
        <section className="border">
          <p className={cn(label, "border-b px-3 py-2")}>What happened · {past.length} of {data.events.length}</p>
          <ol className="grid max-h-64 overflow-y-auto sm:grid-cols-2">
            {log.map((e, i) => (
              <li key={`${e.t}-${i}`}>
                <button type="button" onClick={() => { setPlaying(false); setT(e.t); }} className={cn("flex w-full gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent/40", i === 0 && "bg-accent/30")}>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums" suppressHydrationWarning>{when(e.t, false)}</span>
                  <span>{e.text}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
