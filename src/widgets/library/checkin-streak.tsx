"use client";

import { Empty } from "@/components/widgets/empty";
import { streakOf } from "@/lib/body-math";
import { stat } from "@/widgets/library/persona-kit";
import type { WidgetProps } from "@/widgets/schema";

const DAY_MS = 86_400_000;
const WEEKS = 12;
const no = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY_MS);
const iso = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/** Logged days on a calendar, the current run of days in a row, and the total. Counting only, no judging. */
export function CheckinStreak({ rows, size }: WidgetProps) {
  const days = [...new Set(rows.map((r) => r.day).filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
  if (!days.length) return <Empty text="No check-ins yet." />;

  const logged = new Set(days.map(no));
  const last = no(days.at(-1)!);
  const streak = streakOf(days);

  const numbers = (
    <div className="flex items-end gap-6">
      <div><p className="font-mono text-3xl tabular-nums">{streak}</p><p className={stat}>{streak === 1 ? "day" : "days"} in a row</p></div>
      <div><p className="font-mono text-xl tabular-nums text-muted-foreground">{days.length}</p><p className={stat}>logged</p></div>
    </div>
  );
  if (size === "compact") return <div className="flex h-full items-end px-3 pb-3 pt-7">{numbers}</div>;

  // Columns are weeks (Monday first), ending with the week of the last check-in.
  const end = last + (6 - ((new Date(last * DAY_MS).getUTCDay() + 6) % 7));
  const start = end - WEEKS * 7 + 1;
  const cells = Array.from({ length: WEEKS * 7 }, (_, i) => start + i);

  return (
    <div className="@container h-full overflow-auto [scrollbar-gutter:stable]">
      <div className="grid gap-4">
        {numbers}
        <div className="grid max-w-80 grid-flow-col grid-rows-7 gap-1" style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }} role="img" aria-label={`${days.length} days logged in the last ${WEEKS} weeks`}>
          {cells.map((n) => (
            <span
              key={n}
              title={`${iso(n)}${logged.has(n) ? " · logged" : ""}`}
              className={`aspect-square rounded-[3px] ${n > last ? "bg-transparent" : logged.has(n) ? "bg-electric" : "bg-muted"} ${n === last ? "ring-1 ring-foreground/60" : ""}`}
            />
          ))}
        </div>
        <p className="font-mono text-[11px] text-muted-foreground">Last check-in {iso(last)} · first {days[0]}</p>
      </div>
    </div>
  );
}
