import { ArrowLeft, ArrowRight, Check, Plus } from "lucide-react";
import { ProductPreview } from "@/components/widgets/product-preview";
import { StateBadge, type AgentState } from "@/components/design/agent-kit";
import { Button } from "@/components/ui/button";
import { products } from "@/products";
import { cn } from "@/lib/utils";

export type SlideSource = { name: string; state: AgentState; note: string };
export type Slide = { name: string; area: string; productIds: string[]; sources: SlideSource[]; level: string; cost: string };

const label = "font-mono text-[10px] uppercase tracking-wider text-muted-foreground";

/** One project is one slide: its name, its data products as widgets, and a quiet footer for sources. */
export function ProjectSlide({ s, className }: { s: Slide; className?: string }) {
  return (
    <div className={cn("flex flex-col border bg-background", className)}>
      <div className="flex items-start justify-between gap-4 p-5 pb-0">
        <div className="min-w-0"><p className={label}>{s.area}</p><h4 className="mt-1 truncate text-2xl font-medium tracking-tight">{s.name}</h4></div>
        <span className="shrink-0 font-mono text-xs text-electric">Open →</span>
      </div>
      <ul className="grid flex-1 gap-4 p-5 sm:grid-cols-2">
        {s.productIds.map((id) => {
          const p = products.find((x) => x.id === id)!;
          return <li key={id} className="border"><ProductPreview productId={id} kind={p.kind} data={[]} /><p className="truncate p-3 text-sm font-medium">{p.name}</p></li>;
        })}
      </ul>
      <SourceFooter s={s} />
    </div>
  );
}

/** Sources stay small: a count, the worst state, and one button. Everything else is behind the button. */
export function SourceFooter({ s }: { s: Slide }) {
  const none = s.sources.length === 0;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-5 py-2.5">
      <span className={label}>Sources</span>
      {none ? <span className="text-xs text-muted-foreground">None yet. Products are showing sample data.</span> : (
        <ul className="flex flex-wrap items-center gap-3">{s.sources.map((x) => <li key={x.name} className="flex items-center gap-1.5 text-xs">{x.name}<StateBadge state={x.state} /></li>)}</ul>
      )}
      <span className="ml-auto flex items-center gap-3 font-mono text-[11px] tabular-nums text-muted-foreground">{!none && <span>{s.level} · {s.cost}</span>}<span className="inline-flex items-center gap-1 border px-2 py-1 font-sans text-xs text-foreground"><Plus className="size-3.5" />{none ? "Add a source" : "Source"}</span></span>
    </div>
  );
}

/** Dots, arrows and a count. The slide itself is swiped; these are the fallback and the position. */
export function SlideNav({ at, total }: { at: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-4">
      <span className="grid size-8 place-items-center border text-muted-foreground"><ArrowLeft className="size-4" /></span>
      <ol className="flex items-center gap-1.5" aria-label="Projects">
        {Array.from({ length: total }, (_, i) => <li key={i} className={cn("h-1.5 transition-all", i === at ? "w-6 bg-electric" : "w-1.5 bg-border")} />)}
        <li className="grid size-5 place-items-center border border-dashed text-muted-foreground"><Plus className="size-3" /></li>
      </ol>
      <span className="grid size-8 place-items-center border text-muted-foreground"><ArrowRight className="size-4" /></span>
    </div>
  );
}

/** The last slide: the only place a new project begins. */
export function NewProjectSlide({ className }: { className?: string }) {
  return (
    <div className={cn("grid min-h-64 place-items-center border border-dashed p-6 text-center", className)}>
      <div><span className="mx-auto grid size-10 place-items-center border"><Plus className="size-5" /></span><p className="mt-3 font-medium">New project</p><p className="mt-1 text-sm text-muted-foreground">Name it, pick the data products you want, done.</p></div>
    </div>
  );
}

/** The two-step start: name, then products. Sources are not asked for here. */
export function NewProjectSteps({ step, name, picked }: { step: 1 | 2; name: string; picked: string[] }) {
  const choices = ["people-count", "density-heatmap", "stacked-share"].filter((id) => products.some((p) => p.id === id)).slice(0, 2);
  return (
    <div className="max-w-3xl border">
      <ol className="grid grid-cols-2 border-b text-sm">
        {["Name it", "Choose data products"].map((t, i) => (
          <li key={t} className={cn("flex items-center gap-2 border-b-2 p-3", i + 1 === step ? "border-electric font-medium" : i + 1 < step ? "border-signal" : "border-transparent text-muted-foreground")}>
            <span className={cn("grid size-5 place-items-center border font-mono text-[11px]", i + 1 < step && "border-signal text-signal")}>{i + 1 < step ? <Check className="size-3" /> : i + 1}</span>{t}
          </li>
        ))}
      </ol>
      {step === 1 ? (
        <div className="p-5">
          <p className={label}>Project name</p>
          <div className="mt-2 border px-3 py-2 text-lg">{name}<span className="ml-0.5 inline-block h-5 w-px translate-y-1 bg-electric" /></div>
          <p className="mt-2 text-xs text-muted-foreground">You can rename it later.</p>
        </div>
      ) : (
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          {choices.map((id) => {
            const p = products.find((x) => x.id === id)!;
            const on = picked.includes(id);
            return (
              <div key={id} className={cn("border", on && "outline outline-2 -outline-offset-2 outline-electric")}>
                <ProductPreview productId={id} kind={p.kind} data={[]} />
                <div className="flex items-center justify-between gap-2 p-3"><span className="font-medium">{p.name}</span><span className={cn("inline-flex items-center gap-1 border px-2 py-1 text-xs", on ? "border-electric text-electric" : "text-muted-foreground")}>{on ? <><Check className="size-3.5" />Added</> : <><Plus className="size-3.5" />Add</>}</span></div>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex items-center justify-between border-t p-3">
        <span className="text-xs text-muted-foreground">{step === 1 ? "Step 1 of 2" : `${picked.length} chosen · sources come next, on the project`}</span>
        <Button size="sm" disabled={step === 2 && picked.length === 0}>{step === 1 ? "Next" : "Create project"}</Button>
      </div>
    </div>
  );
}

/** The small source panel that opens from a slide: what the chosen products want, then add, set up, watch. */
export function SourcePopover() {
  const rows: { name: string; why: string; added?: boolean }[] = [
    { name: "Screen share", why: "People count and Density heatmap read video", added: true },
    { name: "Files", why: "Upload photos or clips to a lane" },
    { name: "Weather feed", why: "Optional context for the heatmap" },
  ];
  return (
    <div className="w-full max-w-sm border bg-background">
      <p className="border-b p-3 text-sm font-medium">Add a source</p>
      <p className="border-b p-3 text-xs text-muted-foreground">Suggested for the products in this project.</p>
      <ul>
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-3 border-b p-3 last:border-b-0">
            <span className="min-w-0 flex-1"><span className="block text-sm">{r.name}</span><span className="block truncate text-xs text-muted-foreground">{r.why}</span></span>
            {r.added ? <span className="inline-flex items-center gap-1 text-xs text-signal"><Check className="size-3.5" />Added</span> : <span className="border px-2 py-1 text-xs">Add</span>}
          </li>
        ))}
      </ul>
      <p className="border-t p-3 text-xs text-muted-foreground">Adding only registers it. Open the source to set it up, choose how careful the agents are, and watch it run.</p>
    </div>
  );
}
