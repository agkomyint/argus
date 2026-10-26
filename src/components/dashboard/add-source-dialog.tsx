"use client";

import { Check, CloudSun, FolderOpen, Monitor, Plus, Radio, Webhook } from "lucide-react";
import { useState, useTransition } from "react";
import { addSource } from "@/app/pipeline-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const KINDS = [
  { id: "files", name: "Files", blurb: "Photos, video, CSV and more, kept in a named timeline with lanes", icon: FolderOpen },
  { id: "screen", name: "Screen share", blurb: "Live capture of a screen or camera view", icon: Monitor },
  { id: "weather", name: "Weather feed", blurb: "Open-Meteo, by location", icon: CloudSun },
  { id: "sensor_sim", name: "Sensor", blurb: "Simulated vibration sensor", icon: Radio },
  { id: "webhook", name: "Webhook", blurb: "Push JSON from your own system", icon: Webhook },
] as const;
type Kind = (typeof KINDS)[number]["id"];

export type Suggestion = { kind: Kind; label: string; products: string[]; linked: boolean };

/** Adding only registers the source. You set it up afterwards, from the list. */
export function AddSourceDialog({ suggestions }: { suggestions: Suggestion[] }) {
  const firstNeeded = () => suggestions.find((s) => !s.linked)?.kind ?? "files";
  const [kind, setKind] = useState<Kind>(firstNeeded);
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const def = KINDS.find((k) => k.id === kind)!;
  const tip = (k: Kind) => suggestions.find((s) => s.kind === k);

  const submit = () =>
    start(async () => {
      const f = new FormData();
      f.set("name", name);
      await addSource(kind, f);
      setOpen(false);
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) { setKind(firstNeeded()); setName(""); }
        setOpen(o);
      }}
    >
      <DialogTrigger render={<Button />}><Plus className="size-4" />Add source</DialogTrigger>
      <DialogContent className="flex max-h-[calc(100vh-2rem)] w-[min(60rem,calc(100%-2rem))] max-w-none flex-col gap-0 p-0 sm:max-w-none">
        <DialogHeader className="border-b p-6 pb-4">
          <DialogTitle>Add a source</DialogTitle>
          <DialogDescription>Pick what to connect. You set it up after adding it. One source can feed several data products.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {KINDS.map((k) => {
              const s = tip(k.id);
              const Icon = k.icon;
              return (
                <li key={k.id}>
                  <button
                    type="button"
                    onClick={() => setKind(k.id)}
                    aria-pressed={kind === k.id}
                    className={cn("flex h-full w-full flex-col border p-4 text-left transition-colors hover:bg-accent/40", kind === k.id && "border-electric bg-accent/30")}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className={cn("size-5", kind === k.id ? "text-electric" : "text-muted-foreground")} />
                      <span className="font-medium">{k.name}</span>
                      {s && (
                        <Badge variant={s.linked ? "outline" : "default"} className="ml-auto">
                          {s.linked ? <><Check className="size-3" />Added</> : "Suggested"}
                        </Badge>
                      )}
                    </span>
                    <span className="mt-2 text-sm text-muted-foreground">{k.blurb}</span>
                    {s && <span className="mt-3 text-xs text-muted-foreground">Powers {s.products.join(", ")}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <DialogFooter className="m-0 flex-col gap-3 border-t p-6 pt-4 sm:flex-row sm:items-center">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !pending && submit()}
            placeholder={`Name (optional), e.g. ${kind === "files" ? "Pilot study" : def.name}`}
            maxLength={60}
            aria-label="Source name"
            className="sm:max-w-xs"
          />
          <Button onClick={submit} disabled={pending} className="sm:ml-auto">
            {pending ? "Adding…" : `Add ${def.name.toLowerCase()}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
