"use client";

import { useActionState, useState } from "react";
import { createProject } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SourceNeed } from "@/lib/solutions";
import { cn } from "@/lib/utils";

const TIER = { required: "Required", recommended: "Recommended", optional: "Optional" } as const;

/** Suggested sources for the chosen product. Ticking one connects it; the rest can be added later from Sources. */
export function NewProjectForm({ product, needs }: { product: string; needs: SourceNeed[] }) {
  const [state, action, pending] = useActionState(createProject, undefined);
  const [weather, setWeather] = useState(true);
  const [sensor, setSensor] = useState(true);

  // Photos are the required base signal; the score is what the chosen sources add on top.
  const score = Math.min(100, needs.reduce((n, s) => n + (s.id === "photos" ? 0 : s.id === "weather" ? (weather ? s.lift : 0) : s.id === "vibration" ? (sensor ? s.lift : 0) : 0), 0) + 40);

  return (
    <form action={action} className="grid gap-10 lg:grid-cols-[1fr_20rem]">
      <input type="hidden" name="product" value={product} />
      <div className="grid gap-8">
        <div className="grid max-w-md gap-1.5">
          <label htmlFor="name" className="text-sm font-medium">Project name</label>
          <Input id="name" name="name" placeholder="Harbor Bridge monitoring" required minLength={2} maxLength={80} autoFocus />
        </div>
        <div className="grid max-w-md gap-1.5">
          <label htmlFor="assets" className="text-sm font-medium">Parts to watch</label>
          <Input id="assets" name="assets" defaultValue="Pier A, Pier B" maxLength={300} />
          <p className="text-xs text-muted-foreground">Comma separated. Photos and readings are matched to these by name.</p>
        </div>

        <ul className="border">
          {needs.map((s) => {
            const connectable = s.id === "weather" || s.id === "vibration";
            const on = s.id === "weather" ? weather : s.id === "vibration" ? sensor : false;
            return (
              <li key={s.id} className="grid gap-3 border-b p-4 last:border-b-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <span className={cn("font-mono text-[10px] uppercase tracking-wider", s.tier === "required" ? "text-electric" : s.tier === "recommended" ? "text-signal" : "text-muted-foreground")}>{TIER[s.tier]}</span>
                    <h3 className="text-sm font-medium">{s.name}</h3>
                  </div>
                  <span className="font-mono text-xs text-signal">{s.tier === "required" ? "base signal" : `+${s.lift}% certainty`}</span>
                </div>
                <p className="text-sm text-muted-foreground">{s.why}</p>
                <p className="font-mono text-xs text-muted-foreground">{s.how}</p>
                {s.id === "weather" && (
                  <div className="grid gap-3">
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="weather" checked={weather} onChange={(e) => setWeather(e.target.checked)} /> Connect a weather feed now</label>
                    {weather && (
                      <div className="grid max-w-sm grid-cols-2 gap-2">
                        <Input name="lat" placeholder="Latitude" inputMode="decimal" defaultValue="16.8409" aria-label="Latitude" />
                        <Input name="lng" placeholder="Longitude" inputMode="decimal" defaultValue="96.1735" aria-label="Longitude" />
                      </div>
                    )}
                  </div>
                )}
                {s.id === "vibration" && (
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="sensor" checked={sensor} onChange={(e) => setSensor(e.target.checked)} /> Add a simulated vibration sensor (clearly labelled as simulated)</label>
                )}
                {!connectable && <p className="text-xs text-muted-foreground">Connected after the project is created.</p>}
                <span className="sr-only">{on ? "selected" : "not selected"}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <aside className="h-fit border p-5 lg:sticky lg:top-6">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">How well can we answer?</p>
        <p className="mt-2 font-mono text-5xl tabular-nums">{score}%</p>
        <div className="mt-3 h-2 bg-muted"><div className="h-2 bg-electric" style={{ width: `${score}%` }} /></div>
        <p className="mt-3 text-sm text-muted-foreground">With the sources ticked here plus photos. You can add more later.</p>
        <Button type="submit" disabled={pending} className="mt-6 w-full">{pending ? "Creating…" : "Create and open the product"}</Button>
        {state?.error && <p role="alert" className="mt-3 text-sm text-destructive">{state.error}</p>}
      </aside>
    </form>
  );
}
