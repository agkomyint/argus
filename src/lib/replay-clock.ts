"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentState } from "@/components/design/agent-kit";
import type { EngineNode } from "@/components/design/engine-map";
import type { ReplayData } from "@/lib/replay";

/** Seconds a full replay takes at 1×, however long the project has existed. */
const PLAY_SECONDS = 45;
export const SPEEDS = [0.5, 1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];
/** Panels redraw when the playhead crosses one of this many steps, not on every animation frame. */
const STEPS = 480;

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
 * The playhead's exact time, outside React. It changes every frame while playing, so the few things that move
 * with it (the line, the clock, the scrub fill) subscribe and write to the page themselves, and nothing is
 * rendered again per frame. Everything else reads tq.
 */
export type ClockTime = { get: () => number; subscribe: (f: (t: number) => void) => () => void };

/**
 * The replay clock: play, pause, speed, scrub and jump between events. Quiet stretches are skipped
 * so a project that ran for weeks still plays in under a minute.
 */
export function useReplayClock(data: ReplayData, opts: { start?: number; autoplay?: boolean; follow?: boolean } = {}) {
  const span = data.end - data.start;
  const pulse = Math.max(span / 160, 4_000);
  const [store] = useState(() => {
    let v = opts.start ?? data.end;
    const subs = new Set<(t: number) => void>();
    return {
      get: () => v,
      put: (n: number) => { v = n; for (const f of subs) f(n); },
      subscribe: (f: (t: number) => void) => { subs.add(f); return () => { subs.delete(f); }; },
    };
  });
  // The time as of the last step React saw. It only changes when the playhead crosses into a new step.
  const [at, setAt] = useState(store.get);
  const [playing, setPlaying] = useState(!!opts.autoplay);
  const [speed, setSpeed] = useState<Speed>(1);
  const [skipQuiet, setSkipQuiet] = useState(true);

  const q = Math.max(1, span / STEPS);
  const quant = useCallback((t: number) => (t >= data.end ? data.end : data.start + Math.floor((t - data.start) / q) * q), [data.start, data.end, q]);
  const setTime = useCallback((n: number) => {
    store.put(n);
    setAt((prev) => (quant(prev) === quant(n) ? prev : n));
  }, [store, quant]);
  const tq = quant(at);
  const view = useMemo(() => engineAt(data, tq, pulse), [data, tq, pulse]);

  // Following: new data arrived while the playhead sat at the end, so it stays at the (new) end.
  const endRef = useRef(data.end);
  useEffect(() => {
    const was = endRef.current;
    endRef.current = data.end;
    if (opts.follow && !playing && store.get() >= was) setTime(data.end);
  }, [data.end, opts.follow, playing, store, setTime]);

  const marks = useMemo(() => [...new Set(data.events.map((e) => e.t))].sort((a, b) => a - b), [data.events]);
  // How long something was actually happening, with quiet gaps left out. Busy stretches play over most of
  // PLAY_SECONDS whatever the project's age, so a run that took one minute of a long project is watchable.
  const active = useMemo(() => {
    const spans = [...data.jobs.map((j) => [j.from, Math.max(j.to ?? j.from, j.from) + pulse] as const), ...data.events.map((e) => [e.t, e.t + pulse] as const)].sort((a, b) => a[0] - b[0]);
    let total = 0, end = -Infinity;
    for (const [a, b] of spans) { if (b <= end) continue; total += b - Math.max(a, end); end = b; }
    return Math.min(span, Math.max(total, 10_000));
  }, [data.jobs, data.events, pulse, span]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      const rate = skipQuiet ? active / (PLAY_SECONDS * 0.8) : span / PLAY_SECONDS;
      let next = store.get() + (dt / 1000) * rate * speed;
      if (skipQuiet && !engineAt(data, next, pulse).busy) {
        // Nothing running: jump to just before the next thing that happens.
        const upcoming = marks.find((m) => m > next);
        const jobSoon = data.jobs.find((j) => j.from > next)?.from;
        const target = Math.min(upcoming ?? Infinity, jobSoon ?? Infinity);
        const lead = rate * 0.6;
        // Fast-forward instead of teleporting: close most of the gap each frame, so it still glides.
        if (Number.isFinite(target) && target - next > lead * 2) next += (target - lead - next) * Math.min(1, dt / 180);
      }
      if (next >= data.end) {
        setTime(data.end);
        setPlaying(false);
        return;
      }
      setTime(next);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, skipQuiet, span, pulse, marks, data, active, store, setTime]);

  const play = () => {
    if (store.get() >= data.end) setTime(data.start);
    setPlaying((p) => !p);
  };
  const jump = (dir: 1 | -1) => {
    setPlaying(false);
    const t = store.get();
    const m = dir > 0 ? marks.find((x) => x > t + 1) : [...marks].reverse().find((x) => x < t - 1);
    setTime(m ?? (dir > 0 ? data.end : data.start));
  };
  const seek = useCallback((x: number) => { setPlaying(false); setTime(Math.min(data.end, Math.max(data.start, x))); }, [data.start, data.end, setTime]);

  return { time: store as ClockTime, tq, span, pulse, marks, view, playing, speed, setSpeed, skipQuiet, setSkipQuiet, play, jump, seek };
}
