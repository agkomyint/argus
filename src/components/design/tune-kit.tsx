import { ArrowRight } from "lucide-react";
import { AGENT_LEVELS, money } from "@/lib/agent-levels";
import { cn } from "@/lib/utils";

export const FREQUENCIES = [
  { label: "Every frame", perHour: 7200 },
  { label: "Every 2 s", perHour: 1800 },
  { label: "Every 10 s", perHour: 360 },
  { label: "Every minute", perHour: 60 },
] as const;

export const estimate = (level: number, freq: number) => {
  const l = AGENT_LEVELS[level], f = FREQUENCIES[freq];
  return { cost: (l.costPer100 / 100) * f.perHour, accuracy: l.accuracy, seconds: l.seconds, how: f.label };
};

function Stops({ label, options, at }: { label: string; options: string[]; at: number }) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <ol className="flex border">
        {options.map((o, i) => (
          <li key={o} className={cn("flex-1 border-r px-2 py-2 text-center text-xs last:border-r-0", i === at ? "bg-electric font-medium text-background" : "text-muted-foreground")}>{o}</li>
        ))}
      </ol>
    </div>
  );
}

/** The two dials a person turns, and what each setting costs them. Cheaper means less accurate and less often; better means the reverse. */
export function TunePanel({ level, freq }: { level: number; freq: number }) {
  const now = estimate(level, freq);
  const lo = estimate(0, 3);
  const hi = estimate(AGENT_LEVELS.length - 1, 0);
  const rows = [
    { tag: "Cheapest", set: "Lean · every minute", e: lo },
    { tag: "Your setting", set: `${AGENT_LEVELS[level].name} · ${FREQUENCIES[freq].label.toLowerCase()}`, e: now, you: true },
    { tag: "Best", set: "Maximum · every frame", e: hi },
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        <Stops label="How careful (accuracy)" options={AGENT_LEVELS.map((a) => a.name)} at={level} />
        <Stops label="How often it looks (frequency)" options={FREQUENCIES.map((f) => f.label)} at={freq} />
        <p className="text-xs text-muted-foreground">Move left on either dial and it costs less, but it is less accurate or sees less. Move right and it costs more, and you get better data. Figures are planning estimates, never promises.</p>
      </div>
      <div className="border">
        <p className="border-b p-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">What you get</p>
        <dl className="divide-y">
          {([["Cost", money(now.cost) + " / hour"], ["Accuracy", "~" + now.accuracy + "%"], ["Looks", now.how.toLowerCase()], ["Time each", "~" + now.seconds + " s"]] as const).map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between p-2"><dt className="text-sm text-muted-foreground">{k}</dt><dd className="font-mono text-sm tabular-nums">{v}</dd></div>
          ))}
        </dl>
      </div>
      <ul className="grid gap-px border bg-border lg:col-span-2 sm:grid-cols-3">
        {rows.map((r) => (
          <li key={r.tag} className={cn("bg-background p-3", r.you && "outline outline-2 -outline-offset-2 outline-electric")}>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{r.tag}</p>
            <p className="mt-1 text-sm">{r.set}</p>
            <p className="mt-2 flex items-center gap-2 font-mono text-xs tabular-nums text-muted-foreground">{money(r.e.cost)}/h <ArrowRight className="size-3" /> ~{r.e.accuracy}%</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
