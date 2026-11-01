"use client";

import { Bell, CalendarClock, CircleAlert, Gauge } from "lucide-react";
import { useState } from "react";
import type { AppWindowApp } from "@/components/apps/apps-window";
import { cn } from "@/lib/utils";

/**
 * Delivery: what the switched-on apps hand back, in one tab beside Data products. A Watcher is an alert
 * inbox with a banner when something new arrives, a Digest is a report, a Tracker is a board with a goal.
 * Everything is worked out from the app's Observations by plain code. Shown in /design APP-05.
 */

const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const label = "font-mono text-[10px] uppercase tracking-wider text-muted-foreground";

export function DeliveryPane({ apps, onShow, startRead }: { apps: AppWindowApp[]; onShow?: (appId: string, itemId: string) => void; startRead?: string[] }) {
  const [read, setRead] = useState<string[]>(startRead ?? []);
  const live = apps.filter((a) => a.on);
  const fresh = live.filter((a) => a.kind === "watcher").flatMap((a) => a.lane.items.filter((i) => !read.includes(i.id)).map((i) => ({ app: a, item: i })));

  if (!live.length) return <p className="p-8 text-center text-sm text-muted-foreground">Nothing is delivered yet. Switch an app on in Apps and what it finds shows up here.</p>;

  return (
    <div className="grid gap-3 p-3">
      {fresh.length > 0 ? (
        <div role="status" className="flex flex-wrap items-center gap-3 border border-destructive/50 bg-destructive/5 px-3 py-2">
          <Bell className="size-4 shrink-0 text-destructive" />
          <p className="mr-auto text-sm"><b>{fresh.length === 1 ? "You have a new alert" : `You have ${fresh.length} new alerts`}</b> · {fresh[0].app.name}: {fresh[0].item.label} at {clock(fresh[0].item.at)}</p>
          <button type="button" onClick={() => onShow?.(fresh[0].app.id, fresh[0].item.id)} className="h-7 border px-2.5 text-xs hover:bg-muted">Show on timeline</button>
          <button type="button" onClick={() => setRead(fresh.map((f) => f.item.id).concat(read))} className="h-7 border px-2.5 text-xs hover:bg-muted">Mark all read</button>
        </div>
      ) : live.some((a) => a.kind === "watcher") ? (
        <p className="border px-3 py-2 text-sm text-muted-foreground">No new alerts. Everything has been read.</p>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-2">
        {live.map((a) => (
          <section key={a.id} className="border">
            <header className="flex items-center gap-2 border-b px-3 py-1.5">
              {a.kind === "watcher" ? <Bell className="size-3.5 text-electric" /> : a.kind === "digest" ? <CalendarClock className="size-3.5 text-electric" /> : <Gauge className="size-3.5 text-electric" />}
              <p className="mr-auto text-sm font-medium">{a.name}</p>
              <span className={label}>{a.kind}</span>
            </header>
            {a.blocked && <p role="alert" className="flex items-start gap-1.5 border-b px-3 py-1.5 text-xs text-destructive"><CircleAlert className="mt-0.5 size-3.5 shrink-0" />Your browser blocked alerts. These are still kept here; allow notifications for this site to see them as they arrive.</p>}
            {a.kind === "watcher" && (
              a.lane.items.length === 0 ? <p className="p-4 text-center text-sm text-muted-foreground">No alerts in this clip.</p> : (
                <ul className="grid gap-px bg-border">
                  {a.lane.items.map((i) => {
                    const unread = !read.includes(i.id);
                    return (
                      <li key={i.id} className="bg-background">
                        <button type="button" onClick={() => { setRead([i.id, ...read]); onShow?.(a.id, i.id); }} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/30">
                          <span className={cn("size-2 shrink-0 rotate-45 border", i.severity === "high" ? "border-destructive bg-destructive/40" : "border-electric bg-electric/30")} />
                          <span className={cn("flex-1", unread && "font-medium")}>{i.label}</span>
                          {unread && <span className="font-mono text-[10px] uppercase text-destructive">new</span>}
                          <span className="font-mono text-xs text-muted-foreground">{clock(i.at)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )
            )}
            {a.kind === "digest" && (
              <div className="p-3 text-sm">
                <p className={label}>Report</p>
                <p>{a.lane.items.length} events, {a.lane.items.filter((i) => i.severity === "high").length} high.</p>
                <p className="text-xs text-muted-foreground">{a.lane.items.length ? `First at ${clock(a.lane.items[0].at)}, last at ${clock(a.lane.items[a.lane.items.length - 1].at)}.` : "Nothing to report for this clip."}</p>
              </div>
            )}
            {a.kind === "tracker" && (
              <div className="p-3 text-sm">
                <div className="h-1.5 w-full bg-muted"><div className="h-full bg-electric" style={{ width: `${Math.min(100, Math.round((a.lane.items.length / Math.max(1, a.goal ?? 1)) * 100))}%` }} /></div>
                <p className="mt-1 text-xs text-muted-foreground">{a.lane.items.length} of {a.goal ?? 1} {a.unit ?? "events"}</p>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
