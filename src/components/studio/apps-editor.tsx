"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { removeApp, saveApp } from "@/app/app-actions";
import { AppBuilder, type AppDraft, type AppProduct } from "@/components/apps/app-builder";
import { Switch } from "@/components/ui/switch";
import type { AppConfig } from "@/lib/app-run";
import { cn } from "@/lib/utils";

/**
 * The Apps window: a project's consumer apps. Pick one to change it, or add a new one. Only the Watcher is built
 * so far. What an app finds shows in Delivery and on the timeline, for the owner and in a shared replay.
 */
export function AppsEditor({ projectId, apps, products }: { projectId: string; apps: AppConfig[]; products: AppProduct[] }) {
  const [id, setId] = useState<string>(apps[0]?.id ?? "new");
  const app = apps.find((a) => a.id === id);
  const [error, setError] = useState<string | null>(null);

  const save = (existing?: AppConfig) => async (d: AppDraft) => {
    const r = await saveApp(projectId, { id: existing?.id, ...d, on: existing?.on ?? true, onTimeline: true });
    if ("error" in r) return r.error;
    if (!existing) setId("new");
    return null;
  };
  const flip = async (a: AppConfig, on: boolean) => {
    const r = await saveApp(projectId, { id: a.id, name: a.name, kind: a.kind, reads: a.reads, rule: a.rule, on, onTimeline: a.onTimeline });
    setError("error" in r ? r.error : null);
  };

  return (
    <div className="grid min-h-0 gap-0 lg:grid-cols-[13rem_1fr]">
      <ul className="border-b lg:border-b-0 lg:border-r" aria-label="Apps">
        {apps.map((a) => (
          <li key={a.id}>
            <button type="button" aria-pressed={a.id === id} onClick={() => setId(a.id)} className={cn("block w-full border-b px-3 py-2 text-left text-sm", a.id === id ? "bg-muted/50" : "hover:bg-muted/30", !a.on && "opacity-60")}>
              <span className="block truncate">{a.name}</span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{a.kind} · {a.on ? "on" : "off"}</span>
            </button>
          </li>
        ))}
        <li><button type="button" onClick={() => setId("new")} className={cn("flex w-full items-center gap-1.5 px-3 py-2 text-sm text-electric hover:bg-muted/30", id === "new" && "bg-muted/50")}><Plus className="size-3.5" />New app</button></li>
      </ul>
      <div className="grid min-w-0 content-start gap-3 p-4">
        {app && (
          <label className="flex items-center gap-2 text-sm"><Switch checked={app.on} onCheckedChange={(v) => flip(app, v)} aria-label="App on" />App on <span className="text-xs text-muted-foreground">Off keeps the rule but raises nothing.</span></label>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <AppBuilder key={app?.id ?? "new"} products={products} kinds={["watcher"]}
          start={app ? { kind: app.kind, name: app.name, reads: app.reads, rule: app.rule } : { name: "Crowd watch" }}
          onSave={save(app)} saveLabel={app ? "Save changes" : "Add app"}
          onRemove={app ? async () => { await removeApp(projectId, app.id); setId("new"); } : undefined} />
      </div>
    </div>
  );
}
