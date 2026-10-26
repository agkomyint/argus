import { MessageSquareQuote } from "lucide-react";
import { cn } from "@/lib/utils";

export type Stance = "for" | "against" | "unsure";

const STANCE = {
  for: { label: "Likes it", tone: "text-signal", bar: "bg-signal" },
  against: { label: "Pushes back", tone: "text-destructive", bar: "bg-destructive" },
  unsure: { label: "Unsure", tone: "text-muted-foreground", bar: "bg-muted-foreground" },
} as const;

export type Persona = { name: string; role: string; traits: string[]; basis: string };
export type Opinion = { persona: Persona; stance: Stance; confidence: number; said: string; because: string };

/** Always shown with an opinion: this is a simulated view, not a measurement and not a real person. */
export function SimulatedTag() {
  return <span className="inline-flex items-center gap-1 border border-dashed px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"><MessageSquareQuote className="size-3" />Simulated opinion</span>;
}

/** The stand-in person: who they emulate, what shapes their view, and what that view is based on. */
export function PersonaCard({ p }: { p: Persona }) {
  return (
    <div className="border p-3">
      <div className="flex items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center border bg-accent/40 font-mono text-xs">{p.name.slice(0, 1)}</span>
        <div className="min-w-0"><p className="truncate text-sm font-medium">{p.name}</p><p className="truncate text-[11px] text-muted-foreground">{p.role}</p></div>
      </div>
      <ul className="mt-2 flex flex-wrap gap-1">{p.traits.map((t) => <li key={t} className="border px-1.5 py-0.5 text-[11px] text-muted-foreground">{t}</li>)}</ul>
      <p className="mt-2 border-t pt-2 text-[11px] text-muted-foreground"><span className="font-mono uppercase tracking-wider">Based on </span>{p.basis}</p>
    </div>
  );
}

/** One opinion: stance, how sure, what they said, and the reason in the data. */
export function OpinionCard({ o }: { o: Opinion }) {
  const s = STANCE[o.stance];
  return (
    <div className="flex flex-col border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{o.persona.name}</p>
        <span className={cn("font-mono text-[10px] uppercase tracking-wider", s.tone)}>{s.label}</span>
      </div>
      <p className="mt-2 text-sm">&ldquo;{o.said}&rdquo;</p>
      <p className="mt-2 text-xs text-muted-foreground"><span className="font-mono text-[10px] uppercase tracking-wider">Because </span>{o.because}</p>
      <div className="mt-auto pt-3">
        <div className="h-1 bg-muted"><div className={cn("h-full", s.bar)} style={{ width: `${o.confidence * 100}%` }} /></div>
        <p className="mt-1 font-mono text-[10px] tabular-nums text-muted-foreground">{Math.round(o.confidence * 100)}% sure</p>
      </div>
    </div>
  );
}

/** How the panel split. Counts come from code tallying the stances, never from the model. */
export function PanelTally({ opinions }: { opinions: Opinion[] }) {
  const n = (s: Stance) => opinions.filter((o) => o.stance === s).length;
  return (
    <div>
      <div className="flex h-2 gap-px">
        {(["for", "unsure", "against"] as Stance[]).map((s) => n(s) > 0 && <div key={s} className={STANCE[s].bar} style={{ flex: n(s) }} />)}
      </div>
      <p className="mt-1 flex justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {(["for", "unsure", "against"] as Stance[]).map((s) => <span key={s} className={STANCE[s].tone}>{n(s)} {STANCE[s].label}</span>)}
      </p>
    </div>
  );
}
