"use client";

import "@xyflow/react/dist/style.css";
import {
  addEdge,
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { deleteFlow, draftFlow, runFlow, saveFlow } from "@/app/flow-actions";
import { FlowSteps, summary } from "@/components/flow/flow-steps";
import { Button } from "@/components/ui/button";
import { NODE_DEFS, defaultParams, type FlowGraph, type NodeType } from "@/lib/flow/types";
import { cn } from "@/lib/utils";

type NodeData = { type: NodeType; params: Record<string, string | number>; status?: { out: number; error?: string; note: string } };
type RFNode = Node<NodeData, "flow">;

const GROUP_ORDER = ["Data sources", "Shape", "Agents", "Fusion", "Output"] as const;
const DOT = { "Data sources": "bg-signal", Shape: "bg-muted-foreground", Agents: "bg-electric", Fusion: "bg-signal", Output: "bg-foreground" } as const;

export type Choices = { sources: string[]; products: { id: string; name: string }[] };

const toRF = (g: FlowGraph, status: Record<string, NodeData["status"]>): { nodes: RFNode[]; edges: Edge[] } => ({
  nodes: g.nodes.map((n) => ({ id: n.id, type: "flow", position: { x: n.x, y: n.y }, data: { type: n.type, params: n.params, status: status[n.id] } })),
  edges: g.edges.map((e) => ({ id: e.id, source: e.from, target: e.to, targetHandle: e.port })),
});

const fromRF = (nodes: RFNode[], edges: Edge[]): FlowGraph => ({
  nodes: nodes.map((n) => ({ id: n.id, type: n.data.type, x: Math.round(n.position.x), y: Math.round(n.position.y), params: n.data.params })),
  edges: edges.map((e) => ({ id: e.id, from: e.source, to: e.target, port: e.targetHandle ?? "in" })),
});

function FlowNodeView({ data, selected }: NodeProps<RFNode>) {
  const def = NODE_DEFS[data.type];
  const first = def.params[0];
  return (
    <div className={cn("w-52 border bg-card text-card-foreground", selected && "border-electric", data.status?.error && "border-destructive")}>
      {def.inputs.map((i, k) => (
        <Handle key={i.port} id={i.port} type="target" position={Position.Left} style={{ top: 28 + k * 22 }} className="!size-2.5 !rounded-none !border !border-foreground !bg-background" />
      ))}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className={cn("size-2", DOT[def.group])} />
        <span className="text-sm font-medium">{def.label}</span>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{def.group}</span>
      </div>
      <div className="px-3 py-2 text-xs text-muted-foreground">
        {def.inputs.length > 1 && <div className="mb-1 font-mono text-[10px]">{def.inputs.map((i) => i.label).join(" · ")}</div>}
        {first ? <span className="line-clamp-2 break-words">{String(data.params[first.key] ?? "")}</span> : null}
        {data.status && <div className={cn("mt-1 font-mono text-[10px]", data.status.error ? "text-destructive" : "text-signal")}>{data.status.error ? "failed" : `${data.status.out} rows out`}</div>}
      </div>
      {def.hasOutput && <Handle id="out" type="source" position={Position.Right} className="!size-2.5 !rounded-none !border !border-foreground !bg-electric" />}
    </div>
  );
}

const nodeTypes = { flow: FlowNodeView };

type EditorProps = { id: string; name: string; graph: FlowGraph; status: Record<string, NodeData["status"]>; choices: Choices };

export function FlowEditor(props: EditorProps) {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  );
}

function Editor({ id, name: initialName, graph, status, choices }: EditorProps) {
  const router = useRouter();
  const init = useMemo(() => toRF(graph, status), [graph, status]);
  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>(init.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(init.edges);
  // After a run the server hands down fresh per-node results; show them on the nodes.
  useEffect(() => {
    setNodes((ns) => ns.map((n) => ({ ...n, data: { ...n.data, status: status[n.id] } })));
  }, [status, setNodes]);
  const [view, setView] = useState<"steps" | "canvas">("steps");
  const [name, setName] = useState(initialName);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saved, setSaved] = useState(JSON.stringify({ g: graph, n: initialName }));
  const [msg, setMsg] = useState<string | null>(null);
  const [ask, setAsk] = useState("");
  const [pending, start] = useTransition();

  const current = () => fromRF(nodes, edges);
  const dirty = JSON.stringify({ g: current(), n: name }) !== saved;
  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  const onConnect = useCallback(
    (c: Connection) => {
      setMsg(null);
      setEdges((es) => addEdge({ ...c, id: `e${crypto.randomUUID().slice(0, 8)}` }, es));
    },
    [setEdges],
  );

  const add = (type: NodeType) => {
    setMsg(null);
    const nid = `n${crypto.randomUUID().slice(0, 6)}`;
    const maxX = nodes.reduce((m, n) => Math.max(m, n.position.x), -260);
    setNodes((ns) => [...ns, { id: nid, type: "flow", position: { x: ns.length ? maxX + 270 : 0, y: 40 }, data: { type, params: defaultParams(type) } }]);
    setSelectedId(nid);
  };

  /** Steps view: add a node after `parentId` and wire it in. A second child of the same parent opens a new lane. */
  const addStep = (parentId: string | null, type: NodeType) => {
    setMsg(null);
    const nid = `n${crypto.randomUUID().slice(0, 6)}`;
    const parent = parentId ? nodes.find((n) => n.id === parentId) : null;
    const kids = parentId ? edges.filter((e) => e.source === parentId).length : 0;
    const roots = nodes.filter((n) => NODE_DEFS[n.data.type].inputs.length === 0).length;
    const position = parent ? { x: parent.position.x + 270, y: parent.position.y + kids * 190 } : { x: 0, y: roots * 190 };
    setNodes((ns) => [...ns, { id: nid, type: "flow", position, data: { type, params: defaultParams(type) } }]);
    const port = NODE_DEFS[type].inputs[0]?.port;
    if (parentId && port) setEdges((es) => [...es, { id: `e${crypto.randomUUID().slice(0, 8)}`, source: parentId, target: nid, targetHandle: port }]);
    setSelectedId(nid);
  };

  const connect = (port: string, fromId: string) => {
    if (!selectedId) return;
    setMsg(null);
    setEdges((es) => [...es, { id: `e${crypto.randomUUID().slice(0, 8)}`, source: fromId, target: selectedId, targetHandle: port }]);
  };
  const disconnect = (edgeId: string) => setEdges((es) => es.filter((e) => e.id !== edgeId));

  const setParam = (key: string, value: string | number) => {
    setMsg(null);
    setNodes((ns) => ns.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, params: { ...n.data.params, [key]: value } } } : n)));
  };

  const removeSelected = () => {
    if (!selectedId) return;
    // Removing a step in the middle of a lane joins its neighbours instead of leaving a gap.
    const into = edges.filter((e) => e.target === selectedId);
    const bridge = into.length === 1 ? edges.filter((e) => e.source === selectedId).map((e) => ({ ...e, id: `e${crypto.randomUUID().slice(0, 8)}`, source: into[0].source })) : [];
    setNodes((ns) => ns.filter((n) => n.id !== selectedId));
    setEdges((es) => [...es.filter((e) => e.source !== selectedId && e.target !== selectedId), ...bridge]);
    setSelectedId(null);
  };

  const save = async () => {
    const r = await saveFlow(id, name, current());
    if (r.error) setMsg(r.error);
    else setSaved(JSON.stringify({ g: current(), n: name }));
    return !r.error;
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Flow name" className="min-w-0 border-b bg-transparent text-lg font-medium outline-none focus:border-electric" />
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <span className="flex border text-sm">
            {(["steps", "canvas"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className={cn("px-3 py-1.5 capitalize", view === v ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}>{v}</button>
            ))}
          </span>
          {msg && <span role="status" className="text-sm text-muted-foreground">{msg}</span>}
          <Button variant="outline" disabled={!dirty || pending} onClick={() => start(async () => { if (await save()) setMsg("Saved."); })}>Save</Button>
          <Button
            disabled={pending || nodes.length === 0}
            onClick={() => start(async () => {
              if (dirty && !(await save())) return;
              setMsg("Running…");
              const r = await runFlow(id);
              setMsg(r.error ?? "Done.");
              router.refresh();
            })}
          >
            {pending ? "Working…" : "Save and run"}
          </Button>
        </span>
      </div>

      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            setMsg("Drafting with Meta…");
            const r = await draftFlow(ask);
            if (r.error || !r.graph) return setMsg(r.error ?? "No draft came back");
            const rf = toRF(r.graph, {});
            setNodes(rf.nodes);
            setEdges(rf.edges);
            setSelectedId(null);
            setMsg("Drafted. Look it over, edit anything, then save.");
          });
        }}
      >
        <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Or describe it: “Check the strongest crack findings and publish the ones the data backs up”" className="min-w-0 flex-1 border bg-background px-3 py-2 text-sm" />
        <Button type="submit" variant="outline" disabled={pending || !ask.trim()}>Draft with AI</Button>
      </form>

      <div className={cn("grid gap-px border bg-border", view === "canvas" ? "lg:grid-cols-[13rem_1fr_16rem]" : "lg:grid-cols-[1fr_18rem]")}>
        {view === "canvas" && <aside className="bg-background p-3">
          {GROUP_ORDER.map((g) => (
            <div key={g} className="mb-3">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{g}</p>
              {Object.values(NODE_DEFS).filter((d) => d.group === g).map((d) => (
                <button key={d.type} type="button" onClick={() => add(d.type)} title={d.blurb} className="mt-1 flex w-full items-center gap-2 border px-2 py-1.5 text-left text-sm hover:bg-accent/50">
                  <span className={cn("size-2", DOT[g])} />{d.label}
                </button>
              ))}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Click to add. Drag from a right dot to a left dot to connect.</p>
        </aside>}

        {view === "steps" ? (
          <div className="bg-background">
            <FlowSteps
              nodes={nodes.map((n) => ({ id: n.id, type: n.data.type, params: n.data.params, status: n.data.status }))}
              edges={edges.map((e) => ({ id: e.id, source: e.source, target: e.target }))}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onAdd={addStep}
            />
          </div>
        ) : (
        <div className="h-[520px] bg-background">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId(null)}
            deleteKeyCode={["Backspace", "Delete"]}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
            proOptions={{ hideAttribution: true }}
            colorMode="system"
          >
            <Background gap={20} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        )}

        <aside className="bg-background p-3">
          {selected ? (
            <Inspector node={selected} setParam={setParam} remove={removeSelected} choices={choices} nodes={nodes} edges={edges} connect={connect} disconnect={disconnect} />
          ) : (
            <p className="text-sm text-muted-foreground">Select a node to change what it does. Nodes run left to right, and every node passes rows to the next.</p>
          )}
          <form action={deleteFlow.bind(null, id)} className="mt-6 border-t pt-3">
            <button type="submit" className="text-xs text-muted-foreground hover:text-destructive">Delete this flow</button>
          </form>
        </aside>
      </div>
    </div>
  );
}

function Inspector({ node, setParam, remove, choices, nodes, edges, connect, disconnect }: {
  node: RFNode;
  setParam: (k: string, v: string | number) => void;
  remove: () => void;
  choices: Choices;
  nodes: RFNode[];
  edges: Edge[];
  connect: (port: string, fromId: string) => void;
  disconnect: (edgeId: string) => void;
}) {
  const def = NODE_DEFS[node.data.type];
  // Anything downstream of this node cannot feed it (that would be a loop).
  const downstream = new Set<string>([node.id]);
  for (let grew = true; grew; ) { grew = false; for (const e of edges) if (downstream.has(e.source) && !downstream.has(e.target)) { downstream.add(e.target); grew = true; } }
  const label = (n: RFNode) => `${NODE_DEFS[n.data.type].label}: ${summary(n.data) || "…"}`;
  const candidates = nodes.filter((n) => !downstream.has(n.id) && NODE_DEFS[n.data.type].hasOutput);
  return (
    <div>
      <p className="font-medium">{def.label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{def.blurb}</p>
      {def.inputs.length > 0 && (
        <div className="mt-4 space-y-3 border-t pt-3">
          {def.inputs.map((i) => {
            const wired = edges.filter((e) => e.target === node.id && (e.targetHandle ?? "in") === i.port);
            return (
              <div key={i.port} className="text-sm">
                <span className="text-xs text-muted-foreground">Takes {i.label}</span>
                {wired.map((e) => {
                  const from = nodes.find((n) => n.id === e.source);
                  return (
                    <div key={e.id} className="mt-1 flex items-center justify-between gap-2 border px-2 py-1">
                      <span className="truncate">{from ? label(from) : e.source}</span>
                      <button type="button" aria-label="Disconnect" onClick={() => disconnect(e.id)} className="text-muted-foreground hover:text-destructive">×</button>
                    </div>
                  );
                })}
                <select value="" onChange={(e) => e.target.value && connect(i.port, e.target.value)} className="mt-1 w-full border bg-background px-2 py-1.5 text-muted-foreground">
                  <option value="">{wired.length ? "Connect another…" : "Connect to…"}</option>
                  {candidates.filter((c) => !wired.some((e) => e.source === c.id)).map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}
                </select>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-4 space-y-3">
        {def.params.map((s) => {
          const v = node.data.params[s.key] ?? s.default;
          return (
            <label key={s.key} className="block text-sm">
              <span className="text-xs text-muted-foreground">{s.label}</span>
              {s.kind === "select" ? (
                <select value={String(v)} onChange={(e) => setParam(s.key, e.target.value)} className="mt-1 w-full border bg-background px-2 py-1.5">
                  {s.optionsFrom === "sources" && (<><option value="">Whole project</option>{choices.sources.map((o) => <option key={o}>{o}</option>)}</>)}
                  {s.optionsFrom === "products" && (<><option value="">Custom name</option>{choices.products.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</>)}
                  {s.options?.map((o) => <option key={o}>{o}</option>)}
                </select>
              ) : s.kind === "textarea" ? (
                <textarea value={String(v)} rows={5} maxLength={600} onChange={(e) => setParam(s.key, e.target.value)} className="mt-1 w-full border bg-background p-2" />
              ) : (
                <input type={s.kind === "number" ? "number" : "text"} value={String(v)} onChange={(e) => setParam(s.key, s.kind === "number" ? Number(e.target.value) : e.target.value)} className="mt-1 w-full border bg-background px-2 py-1.5" />
              )}
              {s.hint && <span className="text-[11px] text-muted-foreground">{s.hint}</span>}
            </label>
          );
        })}
      </div>
      <button type="button" onClick={remove} className="mt-4 text-xs text-muted-foreground hover:text-destructive">Remove node</button>
    </div>
  );
}
