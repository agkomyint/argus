"use client";

import { useMemo, useState } from "react";
import { NODE_DEFS, type NodeType } from "@/lib/flow/types";
import { cn } from "@/lib/utils";

export type StepNode = { id: string; type: NodeType; params: Record<string, string | number>; status?: { out: number; error?: string; note: string } };
export type StepEdge = { id: string; source: string; target: string };

const W = 208, H = 76, GX = 48, GY = 60;
const DOT = { "Data sources": "bg-signal", Shape: "bg-muted-foreground", Agents: "bg-electric", Fusion: "bg-signal", Output: "bg-foreground" } as const;
const GROUPS = ["Shape", "Agents", "Fusion", "Output"] as const;

export const summary = (n: Pick<StepNode, "type" | "params">) => {
  const p = n.params;
  if (n.type === "source") return String(p.timeline || "Whole project") + (p.obsType ? ` · ${p.obsType}` : "");
  if (n.type === "publish") return String(p.product || p.publishType || "");
  const first = NODE_DEFS[n.type].params[0];
  return first ? String(p[first.key] ?? "") : "";
};

/** Rows are steps (distance from a source); columns are lanes. A branch opens a new lane, a merge sits over its inputs. */
function layout(nodes: StepNode[], edges: StepEdge[]) {
  const ids = new Set(nodes.map((n) => n.id));
  const parents = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) if (ids.has(e.source) && ids.has(e.target)) parents.get(e.target)!.push(e.source);

  const row = new Map<string, number>();
  const rowOf = (id: string, seen: Set<string>): number => {
    if (row.has(id)) return row.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const ps = parents.get(id)!;
    const r = ps.length ? Math.max(...ps.map((p) => rowOf(p, seen))) + 1 : 0;
    row.set(id, r);
    return r;
  };
  nodes.forEach((n) => rowOf(n.id, new Set()));

  const col = new Map<string, number>();
  const taken = new Set<string>();
  const kids = new Map<string, number>();
  let maxCol = -1;
  for (const n of [...nodes].sort((a, b) => row.get(a.id)! - row.get(b.id)!)) {
    const ps = parents.get(n.id)!.filter((p) => col.has(p));
    let c: number;
    if (!ps.length) c = maxCol + 1;
    else {
      const first = ps.length === 1 && (kids.get(ps[0]) ?? 0) === 0;
      c = ps.length > 1 ? Math.min(...ps.map((p) => col.get(p)!)) : first ? col.get(ps[0])! : maxCol + 1;
      for (const p of ps) kids.set(p, (kids.get(p) ?? 0) + 1);
    }
    if (taken.has(`${row.get(n.id)},${c}`)) c = maxCol + 1;
    taken.add(`${row.get(n.id)},${c}`);
    col.set(n.id, c);
    maxCol = Math.max(maxCol, c);
  }
  const rows = nodes.length ? Math.max(...row.values()) + 1 : 0;
  return { row, col, width: (maxCol + 1) * (W + GX) - GX, height: rows * (H + GY) - GY };
}

export function FlowSteps({ nodes, edges, selectedId, onSelect, onAdd }: {
  nodes: StepNode[];
  edges: StepEdge[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: (parentId: string | null, type: NodeType) => void;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  const L = useMemo(() => layout(nodes, edges), [nodes, edges]);
  const pos = (id: string) => ({ x: (L.col.get(id) ?? 0) * (W + GX), y: (L.row.get(id) ?? 0) * (H + GY) });

  if (!nodes.length) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-start gap-3 p-6">
        <p className="text-sm text-muted-foreground">An empty line. Start with the data it will work on.</p>
        <button type="button" onClick={() => onAdd(null, "source")} className="border px-3 py-2 text-sm hover:bg-accent/50">+ Add data source</button>
      </div>
    );
  }

  return (
    <div className="h-[560px] overflow-auto p-6" onClick={() => { onSelect(null); setMenu(null); }}>
      <div className="relative" style={{ width: Math.max(L.width, W), height: L.height + 60 }}>
        <svg className="pointer-events-none absolute inset-0 text-muted-foreground" width={Math.max(L.width, W)} height={L.height + 60} aria-hidden>
          {edges.filter((e) => L.col.has(e.source) && L.col.has(e.target)).map((e) => {
            const a = pos(e.source), b = pos(e.target);
            const x1 = a.x + W / 2, y1 = a.y + H, x2 = b.x + W / 2, y2 = b.y, ym = y2 - GY / 2;
            return <path key={e.id} d={`M${x1} ${y1} V${ym} H${x2} V${y2}`} fill="none" stroke="currentColor" strokeWidth={1.5} />;
          })}
        </svg>

        {nodes.map((n) => {
          const def = NODE_DEFS[n.type], p = pos(n.id);
          return (
            <div key={n.id} className="absolute" style={{ left: p.x, top: p.y, width: W }}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelect(n.id); setMenu(null); }}
                style={{ height: H }}
                className={cn("block w-full border bg-card p-3 text-left text-card-foreground hover:bg-accent/40", selectedId === n.id && "border-electric", n.status?.error && "border-destructive")}
              >
                <span className="flex items-center gap-2 text-sm font-medium"><span className={cn("size-2", DOT[def.group])} />{def.label}</span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">{summary(n) || def.blurb}</span>
                {n.status && <span className={cn("block font-mono text-[10px]", n.status.error ? "text-destructive" : "text-signal")}>{n.status.error ? "failed" : `${n.status.out} rows out`}</span>}
              </button>
              {def.hasOutput && (
                <div className="absolute left-1/2 z-10 -translate-x-1/2" style={{ top: H + 6 }}>
                  <button
                    type="button"
                    aria-label={`Add a step after ${def.label}`}
                    onClick={(e) => { e.stopPropagation(); setMenu(menu === n.id ? null : n.id); }}
                    className="size-6 border bg-background font-mono text-sm leading-none hover:border-electric hover:text-electric"
                  >+</button>
                  {menu === n.id && (
                    <div className="absolute left-1/2 top-7 z-20 w-56 -translate-x-1/2 border bg-background p-2 shadow-sm" onClick={(e) => e.stopPropagation()}>
                      {GROUPS.map((g) => (
                        <div key={g} className="mb-2 last:mb-0">
                          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{g}</p>
                          {Object.values(NODE_DEFS).filter((d) => d.group === g).map((d) => (
                            <button key={d.type} type="button" title={d.blurb} onClick={() => { onAdd(n.id, d.type); setMenu(null); }} className="mt-1 flex w-full items-center gap-2 border px-2 py-1 text-left text-sm hover:bg-accent/50">
                              <span className={cn("size-2", DOT[g])} />{d.label}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <button type="button" onClick={(e) => { e.stopPropagation(); onAdd(null, "source"); }} className="absolute border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground" style={{ left: 0, top: L.height + 20 }}>
          + Add data source
        </button>
      </div>
    </div>
  );
}
