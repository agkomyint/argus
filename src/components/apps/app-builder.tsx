"use client";

import { Bell, CalendarClock, CircleAlert, Gauge, Play, Save } from "lucide-react";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { CONTRACTS, contractProblems, productFit, timelineProblem, type AppKindId, type ProductFacts } from "@/lib/app-contract";
import type { AppRule, Severity } from "@/lib/app-run";
import { cn } from "@/lib/utils";

/**
 * A consumer app: it reads some data products, applies a rule written in plain code, and delivers inside ARGUS.
 * One shell serves three kinds, Watcher (alert), Digest (report) and Tracker (board). Only "When" and the
 * output change with the kind. No model runs here, so a replay costs nothing. Delivery is always the Delivery
 * tab; a browser notification is an extra the person can switch on. Shown in /design APP-01 and in the Studio Apps window.
 */

export type AppKind = AppKindId;

export const APP_KINDS: Record<AppKind, { name: string; asks: string; output: string; icon: typeof Bell }> = {
  watcher: { name: "Watcher", asks: "Tell me when something happens", output: "An alert, with a cooldown", icon: Bell },
  digest: { name: "Digest", asks: "Sum up what happened", output: "A report in Delivery", icon: CalendarClock },
  tracker: { name: "Tracker", asks: "Show me how it is going", output: "A live board with a goal", icon: Gauge },
};

export type AppProduct = ProductFacts & {
  /** False when no lane in the project feeds it, so the app has nothing to read. */
  available: boolean;
  /** The one dial this product gives an app, e.g. how long an item must be held. */
  dial: { label: string; unit: string; value: number };
};

/** What the form hands back to save. */
export type AppDraft = { name: string; kind: AppKind; reads: string[]; rule: AppRule };

const SEVERITY: Severity[] = ["low", "medium", "high"];
const label = "font-mono text-[10px] uppercase tracking-wider text-muted-foreground";
const selectCls = "h-7 border bg-background px-1.5 font-mono text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40";

export type AppStart = { kind?: AppKind; name?: string; reads?: string[]; rule?: Partial<AppRule>; fired?: number; blocked?: boolean };

function Pick<T extends string>({ value, options, onChange, name }: { value: T; options: readonly T[]; onChange: (v: T) => void; name: string }) {
  return (
    <select aria-label={name} className={selectCls} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export function AppBuilder({ products, start, kinds, onSave, saveLabel = "Save app", onRemove }: {
  products: AppProduct[]; start?: AppStart;
  /** Which kinds can be chosen. All three in /design; the Studio offers the ones that are built. */
  kinds?: AppKind[];
  /** Saves the app. Returns a message when it could not, or null when saved. Without it the button only previews. */
  onSave?: (draft: AppDraft) => Promise<string | null>;
  saveLabel?: string;
  onRemove?: () => void;
}) {
  const allowed = kinds ?? (Object.keys(APP_KINDS) as AppKind[]);
  const [kind, setKind] = useState<AppKind>(start?.kind ?? allowed[0]);
  const [name, setName] = useState(start?.name ?? "Store watch");
  const [reads, setReads] = useState<string[]>(start?.reads ?? products.filter((p) => p.available && !productFit(start?.kind ?? allowed[0], p)).slice(0, 1).map((p) => p.id));
  const [dials, setDials] = useState<Record<string, number>>({ ...Object.fromEntries(products.map((p) => [p.id, p.dial.value])), ...start?.rule?.dials });
  const [severity, setSeverity] = useState<Severity>(start?.rule?.severity ?? "high");
  const [cooldown, setCooldown] = useState(start?.rule?.cooldownMin ?? 5);
  const [browserAlert, setBrowserAlert] = useState(start?.rule?.browserAlert ?? false);
  const [goal, setGoal] = useState(5);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const picked = products.filter((p) => reads.includes(p.id) && p.available && !productFit(kind, p));
  const first = picked[0];
  const problem = contractProblems(kind, picked)[0] ?? null;
  const lane = timelineProblem(picked);
  const contract = CONTRACTS[kind];
  const toggle = (id: string) => setReads((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));
  const fired = start?.fired ?? (onSave ? null : kind === "watcher" ? 3 : 0);

  const save = async () => {
    if (!onSave) return;
    setSaving(true);
    setSaved(null);
    const err = await onSave({ name: name.trim(), kind, reads: picked.map((p) => p.id), rule: { dials: Object.fromEntries(picked.map((p) => [p.id, dials[p.id]])), severity, cooldownMin: cooldown, browserAlert } });
    setSaving(false);
    setFailed(err);
    if (!err) setSaved("Saved. Its alerts show in Delivery and on the timeline.");
  };

  return (
    <section className="grid gap-0 border">
      {allowed.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          {allowed.map((k) => {
            const Icon = APP_KINDS[k].icon;
            return (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={cn("inline-flex items-center gap-1.5 border px-2.5 py-1 text-sm", kind === k ? "border-electric text-electric" : "text-muted-foreground hover:text-foreground")}>
                <Icon className="size-3.5" />{APP_KINDS[k].name}
              </button>
            );
          })}
          <span className="text-xs text-muted-foreground">{APP_KINDS[kind].asks}</span>
        </div>
      )}

      <div className="grid gap-4 p-4">
        <input aria-label="App name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="h-10 border bg-background px-3 text-base font-medium outline-none focus-visible:ring-1 focus-visible:ring-ring" />

        <div className="grid gap-1.5">
          <p className={label}>Reads · data products</p>
          <p className="text-xs text-muted-foreground">A {kind} needs {contract.needs}. {contract.min === contract.max ? contract.min : `${contract.min} to ${contract.max}`} product{contract.max === 1 ? "" : "s"}.</p>
          {products.length === 0 && <p className="border border-dashed p-3 text-sm text-muted-foreground">This project has no data products yet. Add one in Products first.</p>}
          <ul className="grid gap-1.5">
            {products.map((p) => {
              const why = p.available ? productFit(kind, p) : null;
              const on = reads.includes(p.id) && !why;
              return (
                <li key={p.id} className={cn("flex flex-wrap items-center gap-2 border px-2.5 py-1.5", (!p.available || why) && "opacity-60")}>
                  <Switch checked={on && p.available} disabled={!p.available || !!why} onCheckedChange={() => toggle(p.id)} aria-label={`Read ${p.name}`} />
                  <span className="text-sm">{p.name}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{p.kind}</span>
                  {why ? (
                    <span className="ml-auto text-[11px] text-muted-foreground" title={why}>does not fit a {kind}</span>
                  ) : !p.available ? (
                    <span className="font-mono text-[11px] text-muted-foreground">no lane feeds it yet</span>
                  ) : on ? (
                    <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                      {p.dial.label}
                      <input aria-label={`${p.name} ${p.dial.label}`} type="number" min={0} value={dials[p.id]} onChange={(e) => setDials({ ...dials, [p.id]: Number(e.target.value) })} className={cn(selectCls, "w-14")} />
                      {p.dial.unit}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="grid gap-1.5">
          <p className={label}>When · plain code, no AI</p>
          {kind === "watcher" && (
            <p className="flex flex-wrap items-center gap-1.5 text-sm">When {first ? first.name.toLowerCase() : "a product"} is <b className="font-mono">{first ? `${first.dial.label} ${dials[first.id]} ${first.dial.unit}` : "over its dial"}</b>, raise an alert
              <Pick name="Severity" value={severity} options={SEVERITY} onChange={setSeverity} />, then wait
              <input aria-label="Cooldown minutes" type="number" min={0} value={cooldown} onChange={(e) => setCooldown(Number(e.target.value))} className={cn(selectCls, "w-14")} /> min.</p>
          )}
          {kind === "digest" && (
            <p className="text-sm">Add up {picked.length ? picked.map((p) => p.name.toLowerCase()).join(", ") : "nothing yet"} and show one report in Delivery.</p>
          )}
          {kind === "tracker" && (
            <p className="flex flex-wrap items-center gap-1.5 text-sm">Keep a live board of {first ? first.name.toLowerCase() : "a product"} with a goal of
              <input aria-label="Goal" type="number" min={0} value={goal} onChange={(e) => setGoal(Number(e.target.value))} className={cn(selectCls, "w-14")} /> {first?.dial.unit ?? "per day"}.</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <p className={label}>Delivery</p>
          <p className="text-sm text-muted-foreground">Always kept in the Delivery tab with the time it fired, so it can be read again later and in a replay.</p>
          {kind === "watcher" && (
            <label className="flex items-center gap-2 text-sm"><Switch checked={browserAlert} onCheckedChange={setBrowserAlert} aria-label="Also show a browser alert" />Also show a browser alert when one arrives <span className="text-xs text-muted-foreground">(your browser asks once; it costs nothing)</span></label>
          )}
          <Preview kind={kind} name={name} product={first?.name} dial={first ? `${dials[first.id]} ${first.dial.unit}` : ""} severity={severity} goal={goal} unit={first?.dial.unit ?? ""} />
        </div>

        {(problem || start?.blocked || failed) && (
          <p role="alert" className="flex items-start gap-1.5 text-sm text-destructive"><CircleAlert className="mt-0.5 size-4 shrink-0" />{failed ?? problem ?? "Your browser blocked alerts. They are still kept in Delivery; allow notifications for this site to see them as they arrive."}</p>
        )}
        {saved && <p role="status" className="text-sm text-signal">{saved}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <p className="text-sm text-muted-foreground">{fired === null ? "Its alerts are worked out from the data, so a replay costs nothing." : kind === "watcher" ? `Replay: ${fired} alert${fired === 1 ? "" : "s"} in this clip` : kind === "digest" ? "Replay: 1 report for this clip" : "Replay: the board over the clip"}</p>
          <span className="flex items-center gap-2">
            {onRemove && <button type="button" onClick={onRemove} className="h-8 border px-3 text-sm text-muted-foreground hover:border-destructive hover:text-destructive">Remove</button>}
            {onSave ? (
              <button type="button" onClick={save} disabled={!!problem || saving || name.trim().length < 2} className="inline-flex h-8 items-center gap-1.5 border border-electric px-3 text-sm text-electric hover:bg-electric/10 disabled:opacity-40"><Save className="size-3.5" />{saving ? "Saving…" : saveLabel}</button>
            ) : (
              <button type="button" disabled={!!problem || !!lane} title={lane ?? undefined} className="inline-flex h-8 items-center gap-1.5 border px-3 text-sm hover:bg-muted disabled:opacity-40"><Play className="size-3.5" />Play on timeline</button>
            )}
          </span>
        </div>
      </div>
    </section>
  );
}

function Preview({ kind, name, product, dial, severity, goal, unit }: { kind: AppKind; name: string; product?: string; dial: string; severity: string; goal: number; unit: string }) {
  if (kind === "watcher") {
    return (
      <div className="border border-destructive/40 bg-destructive/5 p-2.5 text-sm"><p className="font-mono text-[10px] uppercase tracking-wider text-destructive">{severity} · 14:02</p><p>{name}: {product ?? "an item"} passed {dial}.</p></div>
    );
  }
  if (kind === "digest") {
    return (
      <div className="border p-2.5 text-sm"><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Report · {name}</p><p>{product ?? "Nothing"}: 12 events, longest 34 s, 3 over {dial}.</p></div>
    );
  }
  return (
    <div className="border p-2.5 text-sm"><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Board · {name}</p>
      <div className="mt-1.5 h-1.5 w-full bg-muted"><div className="h-full bg-electric" style={{ width: `${Math.min(100, Math.round((3 / Math.max(1, goal)) * 100))}%` }} /></div>
      <p className="mt-1 text-xs text-muted-foreground">3 of {goal} {unit}</p></div>
  );
}
