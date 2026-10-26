"use client";

import { Check, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { createGeneralProject } from "@/app/actions";
import { ProductPreview } from "@/components/widgets/product-preview";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

export type PickableProduct = { id: string; name: string; summary: string; kind: string; needs: string[] };

/**
 * The two-step start: name it, then choose data products. Sources are not asked for here; they are
 * added on the project's slide afterwards. Controlled when `open` is passed, otherwise it has its own button.
 */
export function NewProjectDialog({ items, open: controlled, onOpenChange, then = "projects" }: { items: PickableProduct[]; open?: boolean; onOpenChange?: (o: boolean) => void; then?: "projects" | "dashboard" }) {
  const [own, setOwn] = useState(false);
  const open = controlled ?? own;
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [state, action, pending] = useActionState(createGeneralProject, undefined);

  const setOpen = (o: boolean) => {
    if (o) { setStep(1); setName(""); setPicked([]); setQ(""); }
    setOwn(o);
    onOpenChange?.(o);
  };
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const s = q.trim().toLowerCase();
  const list = items.filter((p) => !s || `${p.name} ${p.summary} ${p.needs.join(" ")}`.toLowerCase().includes(s));
  const named = name.trim().length >= 2;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {controlled === undefined && <DialogTrigger render={<Button size="sm" className="gap-1.5" />}><Plus className="size-4" />New project</DialogTrigger>}
      <DialogContent className="flex max-h-[calc(100vh-2rem)] w-[min(64rem,calc(100%-2rem))] max-w-none flex-col gap-0 p-0 sm:max-w-none">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>Name it, pick the data products you want. You add sources on the project afterwards.</DialogDescription>
        </DialogHeader>
        <ol className="grid grid-cols-2 border-y text-sm">
          {["Name it", "Choose data products"].map((t, i) => {
            const n = (i + 1) as 1 | 2;
            return (
              <li key={t}>
                <button
                  type="button"
                  disabled={n === 2 && !named}
                  onClick={() => setStep(n)}
                  className={cn("flex w-full items-center gap-2 border-b-2 p-3 text-left disabled:opacity-50", n === step ? "border-electric font-medium" : n < step ? "border-signal" : "border-transparent text-muted-foreground")}
                >
                  <span className={cn("grid size-5 place-items-center border font-mono text-[11px]", n < step && "border-signal text-signal")}>{n < step ? <Check className="size-3" /> : n}</span>
                  {t}
                </button>
              </li>
            );
          })}
        </ol>

        <form
          action={action}
          onSubmit={(e) => { if (step === 1) { e.preventDefault(); if (named) setStep(2); } }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <input type="hidden" name="name" value={name} />
          <input type="hidden" name="then" value={then} />
          {picked.map((id) => <input key={id} type="hidden" name="product" value={id} />)}

          {step === 1 ? (
            <div className="p-6">
              <label htmlFor="project-name" className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Project name</label>
              <Input id="project-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Harbor Bridge monitoring" maxLength={80} className="mt-2 h-11 text-lg" />
              <p className="mt-2 text-xs text-muted-foreground">You can rename it later.</p>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="p-6 pb-3">
                <InputGroup>
                  <InputGroupAddon><Search className="size-4" /></InputGroupAddon>
                  <InputGroupInput autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products, e.g. people, crack, traffic" aria-label="Search data products" />
                </InputGroup>
              </div>
              <ul className="grid min-h-0 flex-1 gap-3 overflow-y-auto px-6 pb-6 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((p) => {
                  const on = picked.includes(p.id);
                  return (
                    <li key={p.id}>
                      <button type="button" onClick={() => toggle(p.id)} aria-pressed={on} className={cn("flex h-full w-full flex-col border text-left hover:bg-accent/30", on && "outline outline-2 -outline-offset-2 outline-electric")}>
                        <ProductPreview productId={p.id} kind={p.kind} data={[]} />
                        <span className="flex flex-1 flex-col p-3">
                          <span className="flex items-start justify-between gap-2">
                            <span className="font-medium">{p.name}</span>
                            <span className={cn("inline-flex shrink-0 items-center gap-1 border px-2 py-0.5 text-xs", on ? "border-electric text-electric" : "text-muted-foreground")}>{on ? <><Check className="size-3.5" />Added</> : <><Plus className="size-3.5" />Add</>}</span>
                          </span>
                          <span className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.summary}</span>
                          <span className="mt-auto pt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Needs {p.needs.join(" or ")}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
                {list.length === 0 && <li className="text-sm text-muted-foreground">Nothing matches “{q}”.</li>}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
            <span className="text-xs text-muted-foreground">
              {step === 1 ? <>Step 1 of 2 · or <Link href="/projects/new" className="underline hover:text-foreground">start from a template</Link></> : `${picked.length} chosen · sources come next, on the project`}
            </span>
            <span className="flex items-center gap-2">
              {state?.error && <span role="alert" className="text-sm text-destructive">{state.error}</span>}
              {step === 2 && <Button type="button" variant="outline" size="sm" onClick={() => setStep(1)}>Back</Button>}
              {step === 1 ? (
                <Button type="submit" size="sm" disabled={!named}>Next</Button>
              ) : (
                <Button type="submit" size="sm" disabled={pending || picked.length === 0}>{pending ? "Creating…" : "Create project"}</Button>
              )}
            </span>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
