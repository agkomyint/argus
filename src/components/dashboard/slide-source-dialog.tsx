"use client";

import { Check, CloudSun, FolderOpen, Monitor, Plus, Radio, Webhook } from "lucide-react";
import { useState, useTransition } from "react";
import { openProject } from "@/app/actions";
import { addSourceTo } from "@/app/engine-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { SourceSuggestion } from "@/lib/product-sources";
import { cn } from "@/lib/utils";

type Kind = "files" | "screen" | "weather" | "sensor_sim" | "webhook";
const KINDS: { id: Kind; name: string; blurb: string; icon: typeof Plus }[] = [
  { id: "screen", name: "Screen share", blurb: "Live capture of a screen or camera view", icon: Monitor },
  { id: "files", name: "Files", blurb: "A timeline you upload photos and clips into, by lane", icon: FolderOpen },
  { id: "weather", name: "Weather feed", blurb: "Open-Meteo, by location", icon: CloudSun },
  { id: "sensor_sim", name: "Sensor", blurb: "Simulated vibration sensor", icon: Radio },
  { id: "webhook", name: "Webhook", blurb: "Push JSON from your own system", icon: Webhook },
];

/** The small source panel on a slide: what this project's products want first, then everything else. */
export function SlideSourceDialog({ projectId, suggestions, empty }: { projectId: string; suggestions: SourceSuggestion[]; empty: boolean }) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<Kind[]>([]);
  const [busy, setBusy] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const tip = (k: Kind) => suggestions.find((s) => s.kind === k);
  const ordered = [...KINDS].sort((a, b) => Number(!tip(a.id) || tip(a.id)!.linked) - Number(!tip(b.id) || tip(b.id)!.linked));

  const add = (k: Kind) => {
    setBusy(k);
    setError(null);
    start(async () => {
      const r = await addSourceTo(projectId, k);
      if (r.error) setError(r.error);
      else setAdded((a) => [...a, k]);
      setBusy(null);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (o) { setAdded([]); setError(null); } setOpen(o); }}>
      <DialogTrigger render={<Button size="sm" variant={empty ? "default" : "outline"} className="gap-1" />}><Plus className="size-3.5" />{empty ? "Add a source" : "Source"}</DialogTrigger>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className="border-b p-4">
          <DialogTitle>Add a source</DialogTitle>
          <DialogDescription>Suggested for the products in this project. Adding only registers it; you set it up next.</DialogDescription>
        </DialogHeader>
        <ul>
          {ordered.map((k) => {
            const t = tip(k.id);
            const done = added.includes(k.id);
            const Icon = k.icon;
            return (
              <li key={k.id} className={cn("flex items-center gap-3 border-b p-3", done && "bg-signal/5")}>
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {k.name}
                    {t && !t.linked && <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-electric">Suggested</span>}
                    {t?.linked && <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-signal">Linked</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{t ? `For ${t.products.join(", ")}` : k.blurb}</p>
                </div>
                <Button size="sm" variant={done ? "outline" : t && !t.linked ? "default" : "outline"} disabled={done || busy === k.id} onClick={() => add(k.id)}>
                  {done ? <><Check className="size-3.5" />Added</> : busy === k.id ? "Adding…" : "Add"}
                </Button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between gap-3 p-3">
          <span className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}>{error ?? (added.length ? `${added.length} added. Set ${added.length === 1 ? "it" : "them"} up to start the agents.` : "Nothing runs until a source is set up.")}</span>
          {added.length > 0 && (
            <form action={openProject.bind(null, projectId, "/dashboard/sources")}>
              <Button type="submit" size="sm">Set up →</Button>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
