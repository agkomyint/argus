"use client";

import { Empty } from "@/components/widgets/empty";
import { personaName } from "@/lib/personas";
import { GROW } from "@/widgets/kit";
import { personaColor, screenKey, stat } from "@/widgets/library/persona-kit";
import type { FlatRow } from "@/widgets/schema";
import type { WidgetProps } from "@/widgets/schema";

const num = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** Agreement reads as a word too, so the number isn't the only cue. */
const verdict = (a: number) => (a >= 75 ? "Same focus" : a >= 50 ? "Mostly aligned" : "Split");

/**
 * Did the simulated visitors look at the same things? One bar per screen, worked out by code from where each
 * persona's eyes went, beside average clarity and how many would carry on.
 */
export function PersonaAgreement({ rows, size }: WidgetProps) {
  // The newest comparison per screen wins, in the order the screens were reviewed.
  const by = new Map<string, FlatRow>();
  for (const r of rows) if (num(r.agreement) !== null) by.set(screenKey(r), r);
  const screens = [...by.values()].sort((a, b) => a.t - b.t);
  if (!screens.length) return <Empty text="No screens compared yet." />;

  const avg = (k: string) => {
    const xs = screens.map((s) => num(s[k])).filter((n): n is number => n !== null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const agreement = avg("agreement") ?? 0;
  const lowest = screens.reduce((lo, s) => (Number(s.agreement) < Number(lo.agreement) ? s : lo));

  if (size === "compact") {
    return (
      <div className="flex h-full items-end gap-1 px-3 pb-2 pt-7">
        {screens.map((s) => <span key={screenKey(s)} className={`min-w-0 flex-1 bg-electric ${GROW}`} style={{ height: `${Number(s.agreement)}%`, opacity: 0.35 + Number(s.agreement) / 160 }} />)}
      </div>
    );
  }

  const clarity = avg("clarity_avg");
  const carryOn = avg("continue_share");

  return (
    <div className="@container h-full overflow-auto [scrollbar-gutter:stable]">
      <div className="grid gap-3">
        <dl className="grid grid-cols-2 gap-px border bg-border @md:grid-cols-4">
          {[
            ["Agreement", `${Math.round(agreement)}%`, verdict(agreement)],
            ["Most split", String(lowest.screen ?? "–"), `${Number(lowest.agreement)}%`],
            ["Avg. clarity", clarity === null ? "–" : `${clarity.toFixed(1)}/10`, ""],
            ["Would continue", carryOn === null ? "–" : `${Math.round(carryOn)}%`, "of visitors"],
          ].map(([k, v, sub]) => (
            <div key={k} className="min-w-0 bg-background px-3 py-2.5">
              <dt className={stat}>{k}</dt>
              <dd className="truncate font-mono text-xl tabular-nums">{v}</dd>
              {sub && <dd className="truncate text-[10px] text-muted-foreground">{sub}</dd>}
            </div>
          ))}
        </dl>

        <section className="border">
          <p className={`${stat} grid grid-cols-[minmax(0,9rem)_1fr_4rem] gap-3 border-b px-3 py-2 @lg:grid-cols-[minmax(0,12rem)_1fr_4rem_5rem]`}>
            <span>Screen</span>
            <span>Looked at the same things</span>
            <span className="text-right">Clarity</span>
            <span className="hidden text-right @lg:block">Continue</span>
          </p>
          <ul className="divide-y">
            {screens.map((s, i) => {
              const a = Number(s.agreement);
              const tone = a >= 75 ? "var(--signal)" : a >= 50 ? "var(--electric)" : "var(--chart-4)";
              return (
                <li key={screenKey(s)} className="grid grid-cols-[minmax(0,9rem)_1fr_4rem] items-center gap-3 px-3 py-2.5 text-xs transition-[opacity,transform] duration-500 starting:-translate-y-1 starting:opacity-0 @lg:grid-cols-[minmax(0,12rem)_1fr_4rem_5rem]">
                  <span className="min-w-0">
                    <span className="block truncate font-medium"><span className="font-mono text-[9px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span> {String(s.screen ?? "Screen")}</span>
                    {s.split_a && s.split_b ? (
                      <span className="flex items-center gap-1 truncate text-[10px] text-muted-foreground">
                        <span className="size-1.5 rounded-full" style={{ background: personaColor(s.split_a) }} />
                        <span className="size-1.5 rounded-full" style={{ background: personaColor(s.split_b) }} />
                        <span className="truncate">{personaName(String(s.split_a))} vs {personaName(String(s.split_b))}</span>
                      </span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="h-2 flex-1 bg-muted"><span className="block h-full transition-[width] duration-700 ease-out starting:w-0" style={{ width: `${a}%`, background: tone }} /></span>
                    <span className="w-16 font-mono text-[11px] tabular-nums">{a}% <span className="hidden text-[9px] text-muted-foreground @xl:inline">{verdict(a)}</span></span>
                  </span>
                  <span className="text-right font-mono tabular-nums">{num(s.clarity_avg)?.toFixed(1) ?? "–"}</span>
                  <span className="hidden text-right font-mono tabular-nums @lg:block">{num(s.continue_share) ?? "–"}%</span>
                </li>
              );
            })}
          </ul>
        </section>
        <p className="text-[10px] text-muted-foreground">Computed by code from the simulated visitors&apos; attention points, not by a model.</p>
      </div>
    </div>
  );
}
