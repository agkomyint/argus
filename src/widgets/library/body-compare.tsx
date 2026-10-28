"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { Empty } from "@/components/widgets/empty";
import { checkins, deltaOf, deltaTone, ESTIMATE, lanesOf, REGION_COLOR, REGION_LABEL, regionsIn, scoreOf, shortDay, signed } from "@/widgets/library/body-kit";
import { stat } from "@/widgets/library/persona-kit";
import { useMediaSrc } from "@/widgets/media";
import type { FlatRow, WidgetProps } from "@/widgets/schema";

/** Day 1 next to the latest day: the two photos (owner only) and what changed in each area. */
export function BodyCompare({ rows, size }: WidgetProps) {
  const all = checkins(rows);
  const lanes = lanesOf(all);
  const [laneId, setLane] = useState<string | null>(null);
  if (!all.length) return <Empty text="No check-ins yet. Day 1 is the first photo you upload." />;

  const lane = lanes.find((l) => l.id === laneId) ?? lanes[0];
  const days = all.filter((r) => String(r.lane_id ?? r.lane ?? "") === lane.id);
  const first = days[0];
  const last = days.at(-1)!;
  const regions = regionsIn([first, last]);
  const span = Math.round((Date.parse(`${String(last.day)}T00:00:00Z`) - Date.parse(`${String(first.day)}T00:00:00Z`)) / 86_400_000);

  if (size === "compact") {
    return (
      <div className="grid h-full grid-cols-2 gap-2 p-2 pt-7">
        <Photo row={first} label="Day 1" />
        <Photo row={last} label={days.length > 1 ? `Day ${span + 1}` : "Today"} />
      </div>
    );
  }

  return (
    <div className="@container h-full overflow-auto [scrollbar-gutter:stable]">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={stat}>{lane.name} · {days.length > 1 ? `${span} days apart` : "only day 1 so far"}</p>
          {lanes.length > 1 && (
            <div className="flex gap-px border bg-border text-xs" role="tablist">
              {lanes.map((l) => (
                <button key={l.id} type="button" role="tab" aria-selected={l.id === lane.id} onClick={() => setLane(l.id)} className={`px-2.5 py-1 ${l.id === lane.id ? "bg-muted text-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}>{l.name}</button>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Photo row={first} label={`Day 1 · ${shortDay(first.day)}`} tall />
          <Photo row={last} label={days.length > 1 ? `Latest · ${shortDay(last.day)}` : "Upload tomorrow to compare"} tall muted={days.length < 2} />
        </div>
        {days.length > 1 && (
          <ul className="grid grid-cols-2 gap-px border bg-border @md:grid-cols-3">
            {regions.map((k) => {
              const d = last.comparable === false ? null : deltaOf(last.vs_day1, k);
              return (
                <li key={k} className="bg-background px-3 py-2">
                  <span className={`${stat} flex items-center gap-1.5`}><span className="size-2 rounded-full" style={{ background: REGION_COLOR[k] }} />{REGION_LABEL[k]}</span>
                  <span className="font-mono text-sm tabular-nums">{scoreOf(first, k) ?? "–"} → {scoreOf(last, k) ?? "–"}</span>
                  <span className={`ml-2 font-mono text-xs tabular-nums ${deltaTone(d)}`}>{signed(d)}</span>
                </li>
              );
            })}
          </ul>
        )}
        {typeof last.summary === "string" && last.summary && <p className="border-l-2 border-electric pl-3 text-sm leading-snug">{last.summary}</p>}
        <p className="text-[11px] text-muted-foreground">{last.comparable === false ? "The latest shot does not match day 1, so the change is not counted. " : ""}{ESTIMATE}</p>
      </div>
    </div>
  );
}

function Photo({ row, label, tall, muted }: { row: FlatRow; label: string; tall?: boolean; muted?: boolean }) {
  const src = useMediaSrc(row.upload_id);
  return (
    <figure className={`relative overflow-hidden border bg-muted/30 ${tall ? "aspect-[3/4]" : "h-full min-h-0"}`}>
      {src && !muted ? (
        // eslint-disable-next-line @next/next/no-img-element -- owner-only media route
        <img src={src} alt={label} className="absolute inset-0 size-full object-cover" />
      ) : (
        <span className="absolute inset-0 grid place-items-center text-muted-foreground"><ImageOff className="size-5" aria-hidden="true" /></span>
      )}
      <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 pb-1.5 pt-6 font-mono text-[10px] uppercase tracking-wider text-white">{label}</figcaption>
    </figure>
  );
}
