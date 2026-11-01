import { Bell, CalendarClock, Gauge } from "lucide-react";
import { Section } from "@/components/landing/section-heading";

const APPS = [
  { icon: Bell, name: "Watcher", line: "Tell me when something happens.", out: "An alert with the time it fired.", live: true },
  { icon: CalendarClock, name: "Digest", line: "Sum up what happened.", out: "Counts, peaks and busiest minutes.", live: false },
  { icon: Gauge, name: "Tracker", line: "Show me how it is going.", out: "A live board against a goal.", live: false },
];

/** The analytic layer: apps read data products, compute with plain code, and answer in the Studio. Built for the home page, shown in /design LND-10. */
export function LandingApps() {
  return (
    <Section id="apps" index="04" label="Apps" title="Data products are the facts. Apps turn them into answers." intro="An app reads the data products you choose, applies a rule you set, and shows the result in the Studio. It is plain code, so no model runs and watching a replay costs nothing.">
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <ul className="grid gap-px border bg-border sm:grid-cols-3">
          {APPS.map(({ icon: Icon, name, line, out, live }) => (
            <li key={name} className="bg-background p-5">
              <Icon className="size-5 text-electric" aria-hidden />
              <h3 className="mt-3 text-lg font-medium">{name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{line}</p>
              <p className="mt-3 text-sm">{out}</p>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{live ? <span className="text-signal">Live in the Studio</span> : "Coming next"}</p>
            </li>
          ))}
        </ul>
        <div className="border bg-card" aria-label="An example alert in Delivery">
          <div className="border-b px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Delivery</div>
          <div className="grid gap-2 p-3">
            <div role="status" className="flex items-center gap-2 border border-destructive/50 bg-destructive/5 px-2.5 py-2 text-xs"><Bell className="size-3.5 shrink-0 text-destructive" aria-hidden /><b>You have a new alert</b></div>
            <ul className="grid gap-px bg-border text-xs">
              <li className="flex items-start gap-2 bg-card px-2.5 py-1.5"><span className="mt-1 size-2 shrink-0 rotate-45 border border-destructive bg-destructive/40" aria-hidden /><span className="min-w-0 flex-1"><b className="block font-medium">Crowd watch: 5 people</b><span className="text-muted-foreground">5 people in one frame, more than 3 · frame at 0:12</span></span><span className="font-mono text-[10px] text-muted-foreground">14:01:12</span></li>
              <li className="flex items-start gap-2 bg-card px-2.5 py-1.5 opacity-40"><span className="mt-1 size-2 shrink-0 rotate-45 border border-electric bg-electric/30" aria-hidden /><span className="min-w-0 flex-1"><b className="block font-medium">Crowd watch: 4 people</b><span className="text-muted-foreground">frame at 0:48</span></span><span className="font-mono text-[10px] text-muted-foreground">14:07:48</span></li>
            </ul>
          </div>
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">Every alert is kept with its time, so you and anyone watching the replay can read it back and jump to the frame.</p>
        </div>
      </div>
    </Section>
  );
}
