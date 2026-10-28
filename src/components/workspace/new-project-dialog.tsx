"use client";

import { Check, Plus, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { createGeneralProject } from "@/app/actions";
import { planLanesFor, suggestProductsFor } from "@/app/setup-actions";
import { GoalStep, LanePlan, ProductPicks, Thinking } from "@/components/workspace/setup-steps";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { planProblems, type SetupLane } from "@/lib/setup-rules";
import { cn } from "@/lib/utils";

export type PickableProduct = { id: string; name: string; summary: string; kind: string; needs: string[] };

export const PRODUCT_STEPS = [{ name: "setup.suggest_products", kind: "model" as const, text: "Reading your goal and matching it to the data product catalog" }];
export const LANE_STEPS = [
  { name: "setup.suggest_lanes", kind: "model" as const, text: "Designing the lanes your files go into" },
  { name: "setup.link_lanes", kind: "model" as const, text: "Linking each lane to the products it feeds" },
  { name: "setup.check_plan", kind: "code" as const, text: "Checking the plan can run: real products, right analyzers, every product fed" },
];

type Step = 1 | 2 | 3;

/**
 * AI setup. The person says what they want to track; the model suggests data products, then plans the
 * lanes and links them to those products; code checks the plan; the person edits and confirms. Every
 * model call is traced and lands in the new project's Observatory. Controlled when `open` is passed.
 */
export function NewProjectDialog({ items, open: controlled, onOpenChange, then = "projects" }: { items: PickableProduct[]; open?: boolean; onOpenChange?: (o: boolean) => void; then?: "projects" | "dashboard" }) {
  const [own, setOwn] = useState(false);
  const open = controlled ?? own;
  const [step, setStep] = useState<Step>(1);
  const [goal, setGoal] = useState("");
  const [name, setName] = useState("");
  const [picks, setPicks] = useState<{ id: string; why: string }[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [lanes, setLanes] = useState<SetupLane[]>([]);
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [thinking, setThinking] = useState<"products" | "lanes" | null>(null);
  const [tick, setTick] = useState(0);
  const [, startTransition] = useTransition();
  const [state, action, pending] = useActionState(createGeneralProject, undefined);

  // Walks the step list while the server works. It never passes the last step until the answer is back.
  useEffect(() => {
    if (!thinking) return;
    const t = setInterval(() => setTick((n) => n + 1), 2600);
    return () => clearInterval(t);
  }, [thinking]);

  const setOpen = (o: boolean) => {
    if (o) { setStep(1); setGoal(""); setName(""); setPicks([]); setPicked([]); setLanes([]); setAttempts(0); setError(null); setThinking(null); }
    setOwn(o);
    onOpenChange?.(o);
  };
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const suggest = () => {
    setError(null);
    setTick(0);
    setThinking("products");
    startTransition(async () => {
      const r = await suggestProductsFor(goal);
      setThinking(null);
      if ("error" in r) return setError(r.error);
      setPicks(r.picks);
      setPicked(r.picks.slice(0, 3).map((p) => p.id));
      if (!name.trim()) setName(r.name);
      setStep(2);
    });
  };
  const plan = () => {
    setError(null);
    setTick(0);
    setThinking("lanes");
    startTransition(async () => {
      const r = await planLanesFor(goal || name, picked);
      setThinking(null);
      if ("error" in r) return setError(r.error);
      setLanes(r.plan.lanes);
      setAttempts(r.attempts);
      setStep(3);
    });
  };

  const problems = step === 3 ? planProblems({ lanes }, picked) : [];
  const named = name.trim().length >= 2;
  const busy = thinking !== null || pending;
  const steps = thinking === "products" ? PRODUCT_STEPS : LANE_STEPS;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {controlled === undefined && <DialogTrigger render={<Button size="sm" className="gap-1.5" />}><Plus className="size-4" />New project</DialogTrigger>}
      <DialogContent className="flex max-h-[calc(100vh-2rem)] w-[min(64rem,calc(100%-2rem))] max-w-none flex-col gap-0 p-0 sm:max-w-none">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="flex items-center gap-2"><Sparkles className="size-4 text-electric" />New project</DialogTitle>
          <DialogDescription>Say what you want to track. ARGUS suggests the data products, plans the lanes your files go into, and links them up. You check it before anything is made.</DialogDescription>
        </DialogHeader>
        <StepBar step={step} reach={lanes.length ? 3 : picks.length || picked.length ? 2 : 1} onStep={(n) => !busy && setStep(n)} />

        <form action={action} onKeyDown={(e) => { if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault(); }} className="flex min-h-0 flex-1 flex-col">
          <input type="hidden" name="name" value={name} />
          <input type="hidden" name="description" value={goal} />
          <input type="hidden" name="then" value={then} />
          {picked.map((id) => <input key={id} type="hidden" name="product" value={id} />)}
          {step === 3 && <input type="hidden" name="plan" value={JSON.stringify({ lanes })} />}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {thinking ? (
              <Thinking steps={steps} current={Math.min(tick, steps.length - 1)} />
            ) : step === 1 ? (
              <GoalStep goal={goal} onGoal={setGoal} error={error} />
            ) : step === 2 ? (
              <ProductPicks items={items} picks={picks} picked={picked} onToggle={toggle} name={name} onName={setName} />
            ) : (
              <LanePlan lanes={lanes} onChange={setLanes} items={items} picked={picked} problems={problems} attempts={attempts} />
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
            <span className="text-xs text-muted-foreground">
              {step === 1 ? (
                <>Step 1 of 3 · <button type="button" onClick={() => { setPicks([]); setStep(2); }} className="underline hover:text-foreground">pick products myself</button> · <Link href="/projects/new" className="underline hover:text-foreground">start from a template</Link></>
              ) : step === 2 ? `${picked.length} chosen · every AI step is kept in the project's Observatory` : `${lanes.length} lane${lanes.length === 1 ? "" : "s"} · files go in from the Studio`}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              {(state?.error || (error && step > 1)) && <span role="alert" className="text-sm text-destructive">{state?.error ?? error}</span>}
              {step > 1 && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setStep((step - 1) as Step)}>Back</Button>}
              {step === 1 && <Button type="button" size="sm" className="gap-1.5" disabled={busy || goal.trim().length < 3} onClick={suggest}><Sparkles className="size-3.5" />Suggest products</Button>}
              {step === 2 && (
                <>
                  <Button type="submit" variant="ghost" size="sm" disabled={busy || !named || !picked.length}>Create without lanes</Button>
                  <Button type="button" size="sm" className="gap-1.5" disabled={busy || !named || !picked.length} onClick={plan}><Sparkles className="size-3.5" />Plan lanes</Button>
                </>
              )}
              {step === 3 && (
                <>
                  <Button type="button" variant="ghost" size="sm" className="gap-1.5" disabled={busy} onClick={plan}><RotateCcw className="size-3.5" />Plan again</Button>
                  <Button type="submit" size="sm" disabled={busy || !named || problems.length > 0}>{pending ? "Creating…" : "Create project"}</Button>
                </>
              )}
            </span>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function StepBar({ step, reach, onStep }: { step: Step; reach: Step; onStep?: (s: Step) => void }) {
  return (
    <ol className="grid grid-cols-3 border-y text-sm">
      {["Your goal", "Data products", "Lanes"].map((t, i) => {
        const n = (i + 1) as Step;
        return (
          <li key={t}>
            <button type="button" disabled={n > reach} onClick={() => onStep?.(n)} className={cn("flex w-full items-center gap-2 border-b-2 p-3 text-left disabled:opacity-50", n === step ? "border-electric font-medium" : n < step ? "border-signal" : "border-transparent text-muted-foreground")}>
              <span className={cn("grid size-5 place-items-center border font-mono text-[11px]", n < step && "border-signal text-signal")}>{n < step ? <Check className="size-3" /> : n}</span>
              {t}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
