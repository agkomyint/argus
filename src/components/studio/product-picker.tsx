"use client";

import { Check, Loader2, Plus, X } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { cn } from "@/lib/utils";

/** One data product as the Products window lists it, with what this project already holds for it. */
export type ProductChoice = {
  id: string;
  name: string;
  summary: string;
  level: string;
  on: boolean;
  /** Observations this project already has that the product reads. */
  ready: number;
  /** Required source kinds, in words ("files", "screen share"). */
  needs: string[];
  /** Upstream products it is computed from, by name. */
  from: string[];
  /** Reads positions, so adding it asks SAM to outline pictures already read. */
  locates?: boolean;
};

const stat = "font-mono text-[10px] uppercase tracking-wider text-muted-foreground";

/**
 * Add or remove data products in one project. A product only reads Observations, so adding one never
 * calls a model: it shows what the sources already produced, and fills as new data arrives.
 */
export function ProductPicker({ items, onToggle }: { items: ProductChoice[]; onToggle: (id: string, on: boolean) => Promise<{ error?: string }> }) {
  const [list, flip] = useOptimistic(items, (cur, { id, on }: { id: string; on: boolean }) => cur.map((p) => (p.id === id ? { ...p, on } : p)));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const toggle = (id: string, on: boolean) =>
    start(async () => {
      setBusy(id);
      setError(null);
      flip({ id, on });
      const r = await onToggle(id, on);
      if (r.error) setError(r.error);
      setBusy(null);
    });

  const on = list.filter((p) => p.on);
  const off = list.filter((p) => !p.on);

  return (
    <div className="grid gap-6">
      {error && <p className="border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <section>
        <p className={cn(stat, "border-b pb-3")}>In this project · {on.length}</p>
        {on.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">None yet. Add one below and it shows up as a scene in the Program.</p>
        ) : (
          <ul className="divide-y">{on.map((p) => <Row key={p.id} p={p} busy={busy === p.id} onClick={() => toggle(p.id, false)} />)}</ul>
        )}
      </section>
      {off.length > 0 && (
        <section>
          <p className={cn(stat, "border-b pb-3")}>Add a data product</p>
          <ul className="divide-y">{off.map((p) => <Row key={p.id} p={p} busy={busy === p.id} onClick={() => toggle(p.id, true)} />)}</ul>
        </section>
      )}
      <p className="text-xs text-muted-foreground">Products read the Observations your sources already wrote, so adding one costs no model calls. The exception is a product that needs positions: SAM 3.1 then outlines the pictures already read, one call per kind of object. Removing one hides it; its Observations stay.</p>
    </div>
  );
}

function Row({ p, busy, onClick }: { p: ProductChoice; busy: boolean; onClick: () => void }) {
  const status = p.ready > 0
    ? <span className="text-signal">{p.ready.toLocaleString("en-US")} {p.ready === 1 ? "record" : "records"} ready</span>
    : p.from.length
      ? <span>Built from {p.from.join(", ")}</span>
      : <span>Waiting for data{p.needs.length ? ` · needs ${p.needs.join(" or ")}` : ""}</span>;
  const sam = p.locates && !p.on ? <span> · adding asks SAM 3.1 to outline pictures already read</span> : null;
  return (
    <li className="flex items-start gap-3 py-3 transition-opacity starting:opacity-0">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-medium">{p.name}</span>
          <span className="font-mono text-[10px] text-muted-foreground">{p.level}</span>
        </p>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.summary}</p>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">{status}{sam}</p>
      </div>
      <button
        type="button" onClick={onClick} disabled={busy}
        className={cn(
          "group flex h-8 shrink-0 items-center gap-1.5 border px-3 text-sm transition-colors disabled:opacity-60",
          p.on ? "border-signal/40 text-signal hover:border-destructive/60 hover:text-destructive" : "border-primary bg-primary text-primary-foreground hover:bg-primary/85",
        )}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : p.on ? <><Check className="size-3.5 group-hover:hidden" /><X className="hidden size-3.5 group-hover:block" /></> : <Plus className="size-3.5" />}
        {p.on ? <><span className="group-hover:hidden">Added</span><span className="hidden group-hover:inline">Remove</span></> : "Add"}
      </button>
    </li>
  );
}
