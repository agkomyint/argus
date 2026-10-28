"use client";

import { Empty } from "@/components/widgets/empty";
import { GROW, moment, PALETTE, text } from "@/widgets/kit";
import type { FlatRow, WidgetProps } from "@/widgets/schema";

const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * Everything a detection dataset holds, at a glance: how many objects, which kinds, when they were seen
 * (one column per frame or minute, stacked by kind), and the newest few with the model's own words.
 */
export function DetectionBoard({ rows, bind, settings, size }: WidgetProps) {
  const found = rows.filter((r) => text(r, bind.category, "") !== "");
  if (found.length === 0) return <Empty text="Nothing to show yet." />;
  const kind = (r: FlatRow) => text(r, bind.category, "other");

  const tally = new Map<string, number>();
  for (const r of found) tally.set(kind(r), (tally.get(kind(r)) ?? 0) + 1);
  const kinds = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  const color = (k: string) => PALETTE[Math.max(0, kinds.findIndex(([x]) => x === k)) % PALETTE.length];

  // One column per moment (a video second, else a clock minute), stacked by kind.
  const cols = new Map<string, Map<string, number>>();
  for (const r of found) {
    const m = moment(r);
    const c = cols.get(m) ?? new Map<string, number>();
    c.set(kind(r), (c.get(kind(r)) ?? 0) + 1);
    cols.set(m, c);
  }
  const timeline = [...cols.entries()].slice(-40);
  const tallest = Math.max(1, ...timeline.map(([, c]) => [...c.values()].reduce((a, b) => a + b, 0)));
  const sure = found.filter((r) => typeof r.confidence === "number" || typeof r.conf === "number");
  const avg = sure.length ? sure.reduce((a, r) => a + Number(r.confidence ?? r.conf), 0) / sure.length : null;

  if (size === "compact") {
    return (
      <div className="flex h-full items-end gap-px px-3 pb-2 pt-7">
        {timeline.map(([m, c]) => (
          <div key={m} className="flex min-w-0 flex-1 flex-col-reverse" style={{ height: "100%" }}>
            {[...c.entries()].map(([k, n]) => <span key={k} className={GROW} style={{ height: `${(n / tallest) * 100}%`, background: color(k) }} />)}
          </div>
        ))}
      </div>
    );
  }

  const latest = found.slice(-Number(settings.latest)).reverse();
  const stat = "font-mono text-[10px] uppercase tracking-wider text-muted-foreground";

  return (
    <div className="@container h-full overflow-auto [scrollbar-gutter:stable]">
      <div className="grid gap-3">
        <dl className="grid grid-cols-2 gap-px border bg-border @md:grid-cols-4">
          {[
            ["Objects", found.length.toLocaleString("en-US")],
            ["Kinds", String(kinds.length)],
            ["Most seen", kinds[0][0]],
            ["Avg. confidence", avg === null ? "–" : pct(avg)],
          ].map(([k, v]) => (
            <div key={k} className="min-w-0 bg-background px-3 py-2.5">
              <dt className={stat}>{k}</dt>
              <dd className="truncate font-mono text-xl tabular-nums capitalize">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="grid gap-3 @2xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <section className="border p-3">
            <p className={stat}>Seen over time</p>
            <div className="mt-3 flex h-32 items-end gap-0.5 @2xl:h-44">
              {timeline.map(([m, c]) => {
                const total = [...c.values()].reduce((a, b) => a + b, 0);
                return (
                  <div key={m} className="group flex h-full min-w-0 flex-1 flex-col justify-end" title={`${m}: ${[...c.entries()].map(([k, n]) => `${n} ${k}`).join(", ")}`}>
                    <span className="mb-0.5 text-center font-mono text-[9px] tabular-nums text-muted-foreground opacity-0 group-hover:opacity-100">{total}</span>
                    <div className={`flex flex-col-reverse ${GROW}`} style={{ height: `${(total / tallest) * 85}%` }}>
                      {[...c.entries()].map(([k, n]) => <span key={k} className="min-h-px transition-[height] duration-500 ease-out" style={{ height: `${(n / total) * 100}%`, background: color(k) }} />)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-1 flex justify-between font-mono text-[9px] text-muted-foreground">
              <span>{timeline[0][0]}</span>
              {timeline.length > 1 && <span>{timeline[timeline.length - 1][0]}</span>}
            </div>
          </section>

          <section className="border p-3">
            <p className={stat}>What was found</p>
            <ul className="mt-3 space-y-2">
              {kinds.slice(0, Number(settings.top)).map(([k, n]) => (
                <li key={k} className="grid grid-cols-[minmax(0,6rem)_1fr_auto] items-center gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-1.5 capitalize"><span className="size-2 shrink-0" style={{ background: color(k) }} /><span className="truncate">{k}</span></span>
                  <span className="h-1.5 bg-muted"><span className="block h-full transition-[width] duration-500 ease-out" style={{ width: `${(n / kinds[0][1]) * 100}%`, background: color(k) }} /></span>
                  <span className="font-mono tabular-nums text-muted-foreground">{n}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="border">
          <p className={`${stat} border-b px-3 py-2`}>Latest</p>
          <ul className="divide-y">
            {latest.map((r, i) => {
              const k = kind(r);
              const c = Number(r.confidence ?? r.conf);
              return (
                <li key={found.length - i} className="flex items-start gap-2.5 px-3 py-2 transition-[opacity,transform] duration-500 ease-out starting:-translate-y-1 starting:opacity-0">
                  <span className="mt-1.5 size-2 shrink-0" style={{ background: color(k) }} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline gap-2 text-xs">
                      <span className="font-medium capitalize">{k}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{moment(r)}</span>
                      {Number.isFinite(c) && <span className="ml-auto font-mono text-[10px] text-signal">{pct(c)}</span>}
                    </p>
                    {typeof r.description === "string" && <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{r.description}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
