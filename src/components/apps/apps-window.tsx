"use client";

import { useState } from "react";
import { AppBuilder, type AppKind, type AppProduct } from "@/components/apps/app-builder";
import { AppTimeline, type AppLane } from "@/components/apps/app-timeline";
import { DeliveryPane } from "@/components/apps/delivery-tab";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { timelineProblem } from "@/lib/app-contract";
import { cn } from "@/lib/utils";

/**
 * How consumer apps sit in the Studio. Three places, one job each:
 *  - the Apps button on the top bar opens a dialog where an app is set up: which data products it reads
 *    (only ones its contract accepts), its rule, and whether it adds a lane to the timeline;
 *  - the Delivery tab, beside Data products, shows what the apps hand back: an alert banner and inbox, a report, a board;
 *  - the timeline shows each switched-on app as an extension lane.
 * Shown in /design APP-04 and APP-05. Nothing is saved.
 */

export type AppWindowApp = {
  id: string;
  name: string;
  kind: AppKind;
  /** Ids of the data products it reads. */
  reads: string[];
  on: boolean;
  onTimeline: boolean;
  lane: AppLane;
  browserAlert?: boolean;
  blocked?: boolean;
  goal?: number;
  unit?: string;
};

type Tab = "Data products" | "Delivery";
const label = "font-mono text-[10px] uppercase tracking-wider text-muted-foreground";
const BAR = ["Lanes", "Products", "Apps", "Observatory"] as const;

export function AppsWindow({ apps, products, duration, start }: { apps: AppWindowApp[]; products: AppProduct[]; duration: number; start?: { app?: string; open?: boolean; tab?: Tab; read?: string[] } }) {
  const [open, setOpen] = useState(start?.open ?? false);
  const [tab, setTab] = useState<Tab>(start?.tab ?? "Delivery");
  const [state, setState] = useState(apps);
  const [id, setId] = useState(start?.app ?? apps[0]?.id);
  const [picked, setPicked] = useState<string | undefined>();
  const app = state.find((a) => a.id === id);
  const set = (key: "on" | "onTimeline", v: boolean) => setState((s) => s.map((a) => (a.id === id ? { ...a, [key]: v, ...(key === "on" && !v ? { onTimeline: false } : {}) } : a)));
  const lanes = state.filter((a) => a.on && a.onTimeline).map((a) => a.lane);
  const lanePick = app ? timelineProblem(products.filter((p) => app.reads.includes(p.id))) : null;
  const alerts = state.filter((a) => a.on && a.kind === "watcher").reduce((n, a) => n + a.lane.items.length, 0);

  return (
    <section className="border">
      <nav className="flex border-b" aria-label="Studio top bar">
        {BAR.map((t) => (
          <button key={t} type="button" disabled={t !== "Apps"} aria-haspopup="dialog" onClick={() => setOpen(true)} className={cn("border-b-2 px-4 py-2 text-sm", t === "Apps" ? "border-electric text-foreground" : "border-transparent text-muted-foreground opacity-60")}>
            {t}{t === "Apps" && <span className="ml-1.5 font-mono text-[10px] text-electric">{state.filter((a) => a.on).length}</span>}
          </button>
        ))}
      </nav>

      <div role="tablist" aria-label="Rail" className="flex border-b">
        {(["Data products", "Delivery"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("border-b-2 px-4 py-1.5 text-sm", tab === t ? "border-electric" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t}{t === "Delivery" && alerts > 0 && <span className="ml-1.5 bg-destructive px-1 font-mono text-[10px] text-white">{alerts}</span>}
          </button>
        ))}
      </div>
      {tab === "Data products" ? (
        <p className="p-6 text-center text-sm text-muted-foreground">The data product scenes, unchanged. Delivery is the tab beside them.</p>
      ) : (
        <DeliveryPane apps={state} startRead={start?.read} onShow={(appId, itemId) => { setState((s) => s.map((a) => (a.id === appId ? { ...a, onTimeline: true } : a))); setPicked(itemId); }} />
      )}

      <div className="border-t p-3">
        <p className={cn(label, "mb-1.5")}>Timeline · {lanes.length} app lane{lanes.length === 1 ? "" : "s"}</p>
        <AppTimeline key={`${picked}-${lanes.length}`} duration={duration} lanes={lanes} start={{ selected: picked }} />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-4rem)] w-[min(60rem,calc(100%-2rem))] max-w-none flex-col gap-0 p-0 sm:max-w-none">
          <DialogHeader className="border-b bg-card px-5 py-3">
            <DialogTitle className="font-mono text-xs uppercase tracking-wider">Apps</DialogTitle>
            <DialogDescription>Set up an app here: pick the data products it reads, write its rule, and choose whether it adds a lane to the timeline. What it finds shows in Delivery.</DialogDescription>
          </DialogHeader>
          {state.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No apps yet. Add one: choose a kind, pick the data products it reads, and write its rule.</p>
          ) : (
            <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[13rem_1fr]">
              <ul className="border-b lg:border-b-0 lg:border-r" aria-label="Apps">
                {state.map((a) => (
                  <li key={a.id}>
                    <button type="button" aria-pressed={a.id === id} onClick={() => { setId(a.id); setPicked(undefined); }} className={cn("block w-full border-b px-3 py-2 text-left text-sm", a.id === id ? "bg-muted/50" : "hover:bg-muted/30", !a.on && "opacity-60")}>
                      <span className="block truncate">{a.name}</span><span className={label}>{a.kind} · {a.on ? "on" : "off"}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {app && (
                <div className="grid min-w-0 content-start gap-3 p-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-sm"><Switch checked={app.on} onCheckedChange={(v) => set("on", v)} aria-label="App on" />App on</label>
                    <label className={cn("flex items-center gap-2 text-sm", (!app.on || !!lanePick) && "opacity-40")} title={lanePick ?? undefined}><Switch checked={app.onTimeline} disabled={!app.on || !!lanePick} onCheckedChange={(v) => set("onTimeline", v)} aria-label="Add lane to timeline" />Add lane to timeline</label>
                    <span className="text-xs text-muted-foreground">The lane is this app&apos;s extension on the timeline.</span>
                  </div>
                  <AppBuilder key={app.id} products={products} start={{ kind: app.kind, name: app.name, reads: app.reads, fired: app.lane.items.length, blocked: app.blocked }} />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
