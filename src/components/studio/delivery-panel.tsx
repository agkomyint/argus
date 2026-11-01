"use client";

import { Bell, BellOff, BellRing } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toNotify, type AppAlert, type AppConfig } from "@/lib/app-run";
import { cn } from "@/lib/utils";

/**
 * Delivery: what the switched-on apps found, kept as a list with the time each one fired, so the owner and anyone
 * watching a shared replay can read it back. An alert after the playhead is dimmed until the replay gets there.
 * The browser notification is the viewer's own and costs nothing; the list is always there either way.
 * Shown in /design APP-06.
 */

const label = "font-mono text-[10px] uppercase tracking-wider text-muted-foreground";
const pad = (n: number) => String(n).padStart(2, "0");
/** UTC clock time, the same one the timeline uses. */
export const hms = (ms: number) => new Date(ms).toISOString().slice(11, 19);
/** How far into the replay, as mm:ss. */
export const into = (ms: number, start: number) => { const s = Math.max(0, Math.round((ms - start) / 1000)); return `+${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };

type Permission = NotificationPermission | "unsupported";
const listeners = new Set<() => void>();
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
const permission = (): Permission => (typeof Notification === "undefined" ? "unsupported" : Notification.permission);

/** The browser's notification permission for this site. It changes only when the viewer answers the prompt. */
function usePermission() {
  const now = useSyncExternalStore(subscribe, permission, () => "unsupported" as Permission);
  const ask = async () => {
    if (typeof Notification === "undefined") return;
    try { await Notification.requestPermission(); } catch { /* an old browser; the list still works */ }
    listeners.forEach((f) => f());
  };
  return [now, ask] as const;
}

/**
 * Raises a browser notification when the playhead passes an alert of an app that asked for one. It starts at the
 * playhead, so alerts already behind it are not announced, and it does nothing while paused or without permission.
 */
export function AlertNotifier({ alerts, apps, tq, playing }: { alerts: AppAlert[]; apps: AppConfig[]; tq: number; playing: boolean }) {
  const last = useRef(tq);
  const seen = useRef(new Set<string>());
  useEffect(() => {
    const from = last.current;
    last.current = tq;
    if (!playing || tq <= from || permission() !== "granted") return;
    const fresh = toNotify(alerts, apps, from, tq, seen.current);
    for (const a of fresh) seen.current.add(a.id);
    // A burst is one notification, so a long skip does not bury the screen.
    for (const a of fresh.slice(0, 3)) {
      try { new Notification(`${a.appName}: ${a.label}`, { body: `${a.why} · ${hms(a.at)} UTC`, tag: a.id }); } catch { /* a blocked or unsupported browser keeps the list only */ }
    }
  }, [alerts, apps, tq, playing]);
  return null;
}

export function DeliveryPanel({ alerts, tq, start, onShow, wantsBrowser }: {
  alerts: AppAlert[]; tq: number; start: number;
  /** Opens an alert: the studio moves to the frame or file it came from. */
  onShow: (a: AppAlert) => void;
  /** True when some app asked for a browser alert, so the permission button is worth showing. */
  wantsBrowser: boolean;
}) {
  const [perm, ask] = usePermission();
  const [read, setRead] = useState<string[]>([]);
  const past = alerts.filter((a) => a.at <= tq);
  const fresh = past.filter((a) => !read.includes(a.id));
  const latest = fresh.at(-1);

  if (!alerts.length) {
    return <p className="p-6 text-center text-[11px] text-muted-foreground">No alerts. Add an app in Apps and switch it on; what it finds is kept here with the time it fired.</p>;
  }

  return (
    <div className="grid content-start gap-2 p-2">
      {fresh.length > 0 && latest ? (
        <div role="status" className="flex flex-wrap items-center gap-2 border border-destructive/50 bg-destructive/5 px-2.5 py-2">
          <Bell className="size-3.5 shrink-0 text-destructive" />
          <p className="mr-auto min-w-0 text-xs"><b>{fresh.length === 1 ? "You have a new alert" : `You have ${fresh.length} new alerts`}</b> · {latest.appName}: {latest.label} at {hms(latest.at)}</p>
          <button type="button" onClick={() => onShow(latest)} className="h-6 border px-2 text-[11px] hover:bg-muted">Show</button>
          <button type="button" onClick={() => setRead([...read, ...fresh.map((f) => f.id)])} className="h-6 border px-2 text-[11px] hover:bg-muted">Mark all read</button>
        </div>
      ) : (
        <p className="border px-2.5 py-2 text-xs text-muted-foreground">{past.length ? "No new alerts. Everything so far has been read." : "No alert yet at this point. Press play to watch for them."}</p>
      )}

      {wantsBrowser && perm !== "unsupported" && (
        perm === "granted" ? (
          <p className="flex items-center gap-1.5 text-[11px] text-signal"><BellRing className="size-3" />Browser alerts on. They show while the replay plays.</p>
        ) : perm === "denied" ? (
          <p role="alert" className="flex items-center gap-1.5 text-[11px] text-destructive"><BellOff className="size-3" />Your browser blocked alerts. They are still kept here; allow notifications for this site to get them as they arrive.</p>
        ) : (
          <button type="button" onClick={ask} className="flex h-7 items-center justify-center gap-1.5 border border-electric text-[11px] text-electric hover:bg-electric/10"><BellRing className="size-3" />Allow browser alerts</button>
        )
      )}

      <div className="flex items-center justify-between"><p className={label}>All alerts · {alerts.length}</p><p className={label}>time · into the replay</p></div>
      <ul className="grid gap-px bg-border" aria-label="Alert history">
        {alerts.map((a) => {
          const unread = a.at <= tq && !read.includes(a.id);
          return (
            <li key={a.id} className="bg-card">
              <button type="button" onClick={() => { onShow(a); setRead(read.includes(a.id) ? read : [...read, a.id]); }} title={a.why}
                className={cn("flex w-full items-start gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted/30", a.at > tq && "opacity-40")}>
                <span className={cn("mt-1 size-2 shrink-0 rotate-45 border", a.severity === "high" ? "border-destructive bg-destructive/40" : "border-electric bg-electric/30")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate", unread && "font-medium")}>{a.appName}: {a.label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{a.why}{a.frameMs !== null && ` · frame at ${into(a.frameMs, 0).slice(1)}`}</span>
                </span>
                {unread && <span className="font-mono text-[10px] uppercase text-destructive">new</span>}
                <span className="shrink-0 text-right font-mono text-[10px] text-muted-foreground">{hms(a.at)}<br />{into(a.at, start)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
