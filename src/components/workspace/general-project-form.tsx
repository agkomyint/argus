"use client";

import { useActionState } from "react";
import { createGeneralProject } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Item = { id: string; name: string; summary: string; level: string };

export function GeneralProjectForm({ items, preselected = [] }: { items: Item[]; preselected?: string[] }) {
  const [state, action, pending] = useActionState(createGeneralProject, undefined);
  return (
    <form action={action} className="grid max-w-2xl gap-6">
      <div className="grid max-w-md gap-1.5">
        <label htmlFor="name" className="text-sm font-medium">Project name</label>
        <Input id="name" name="name" required minLength={2} maxLength={80} autoFocus />
      </div>
      <ul className="border">
        {items.map((p) => (
          <li key={p.id} className="border-b last:border-b-0">
            <label className="flex cursor-pointer items-start gap-3 p-4 hover:bg-accent/40">
              <input type="checkbox" name="product" value={p.id} defaultChecked={preselected.includes(p.id)} className="mt-1" />
              <span>
                <span className="block text-sm font-medium">{p.name} <span className="ml-1 font-mono text-xs text-muted-foreground">{p.level}</span></span>
                <span className="block text-sm text-muted-foreground">{p.summary}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-fit">{pending ? "Creating…" : "Create project"}</Button>
    </form>
  );
}
