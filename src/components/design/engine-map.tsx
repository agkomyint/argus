"use client";

import { useMemo, useState } from "react";
import { AgentBadge, StateBadge, type AgentKind, type AgentState } from "@/components/design/agent-kit";
import { cn } from "@/lib/utils";

export type EngineNode = { id: string; col: number; label: string; sub: string; kind: AgentKind | "source" | "product"; state: AgentState; rate?: string };
export type EngineEdge = [from: string, to: string];

export const COLUMNS = ["Data sources", "Agents", "Fusion", "Unified layers", "Data products"] as const;

const W = 152;
const H = 96;
const GX = 36;
const GY = 14;

/**
 * The whole engine on one screen: raw data on the left, finished data products on the right,
 * every agent in between. Hover a box to light up everything feeding it and everything it feeds.
 */
export function EngineMap({ nodes, edges }: { nodes: EngineNode[]; edges: EngineEdge[] }) {
  const [hot, setHot] = useState<string | null>(null);

  const pos = useMemo(() => {
    const rowOf = new Map<string, number>();
    const seen = COLUMNS.map(() => 0);
    for (const n of nodes) rowOf.set(n.id, seen[n.col]++);
    return new Map(nodes.map((n) => [n.id, { x: n.col * (W + GX), y: rowOf.get(n.id)! * (H + GY) }]));
  }, [nodes]);

  /** Everything upstream and downstream of the hovered box. */
  const lit = useMemo(() => {
    if (!hot) return null;
    const set = new Set([hot]);
    const walk = (from: 0 | 1, to: 0 | 1) => {
      const todo = [hot];
      while (todo.length) {
        const cur = todo.pop()!;
        for (const e of edges) if (e[from] === cur && !set.has(e[to])) { set.add(e[to]); todo.push(e[to]); }
      }
    };
    walk(1, 0);
    walk(0, 1);
    return set;
  }, [hot, edges]);

  const stateOf = useMemo(() => new Map(nodes.map((n) => [n.id, n.state])), [nodes]);

  const width = COLUMNS.length * W + (COLUMNS.length - 1) * GX;
  const height = Math.max(...COLUMNS.map((_, c) => nodes.filter((n) => n.col === c).length)) * (H + GY) - GY;

  return (
    <div className="overflow-x-auto border">
      <div className="p-4" style={{ minWidth: width + 32 }}>
        <div className="mb-3 flex" style={{ width }}>
          {COLUMNS.map((c, i) => (
            <p key={c} className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground" style={{ width: W, marginRight: i < COLUMNS.length - 1 ? GX : 0 }}>{c}</p>
          ))}
        </div>
        <div className="relative" style={{ width, height }}>
          <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden>
            {edges.map(([a, b]) => {
              const p = pos.get(a)!, q = pos.get(b)!;
              const x1 = p.x + W, y1 = p.y + H / 2, x2 = q.x, y2 = q.y + H / 2, mx = (x1 + x2) / 2;
              const on = !lit || (lit.has(a) && lit.has(b));
              const sa = stateOf.get(a), sb = stateOf.get(b);
              const bad = sa === "error" || sb === "error";
              const held = sa === "paused" || sb === "paused";
              const moving = !bad && !held && (sa === "working" || sb === "working");
              const stroke = bad ? "var(--destructive)" : held ? "var(--chart-4)" : moving || (on && lit) ? "var(--electric)" : "var(--border)";
              return <path key={a + b} className={moving ? "engine-flow" : undefined} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke={stroke} strokeWidth={moving || (on && lit) ? 2 : 1.5} opacity={on ? 1 : 0.2} />;
            })}
          </svg>
          {nodes.map((n) => {
            const p = pos.get(n.id)!;
            const dim = lit && !lit.has(n.id);
            return (
              <button
                key={n.id}
                type="button"
                onMouseEnter={() => setHot(n.id)}
                onMouseLeave={() => setHot(null)}
                onFocus={() => setHot(n.id)}
                onBlur={() => setHot(null)}
                className={cn(
                  "absolute flex flex-col border bg-background p-2.5 text-left transition-opacity hover:bg-accent/40",
                  n.state === "working" && "border-electric",
                  n.state === "paused" && "border-chart-4",
                  n.state === "error" && "border-destructive",
                  n.state === "waiting" && "border-dashed",
                  dim && "opacity-30",
                )}
                style={{ left: p.x, top: p.y, width: W, height: H }}
              >
                <span className="flex items-center justify-between gap-1 whitespace-nowrap [&_svg]:hidden">
                  <StateBadge state={n.state} />
                  {n.kind === "source" || n.kind === "product" ? <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{n.kind}</span> : <AgentBadge kind={n.kind} />}
                </span>
                <span className="mt-1.5 truncate text-sm font-medium leading-tight">{n.label}</span>
                <span className="truncate text-[11px] leading-tight text-muted-foreground">{n.sub}</span>
                {n.rate && <span className="mt-auto font-mono text-[10px] tabular-nums text-muted-foreground">{n.rate}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
