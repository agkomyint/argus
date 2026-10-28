"use client";

import { useState } from "react";
import { Empty } from "@/components/widgets/empty";
import type { BodyRegion } from "@/lib/body-math";
import { checkins, deltaOf, deltaTone, ESTIMATE, lanesOf, REGION_COLOR, REGION_LABEL, regionsIn, scoreOf, shortDay, signed, sinceDay1 } from "@/widgets/library/body-kit";
import { stat } from "@/widgets/library/persona-kit";
import type { WidgetProps } from "@/widgets/schema";

const W = 600;
const H = 200;
const PAD = { l: 26, r: 10, t: 10, b: 22 };

/** One line per body area across the logged days. Hollow dots are shots that did not match day 1. */
export function BodyProgress({ rows, size, settings }: WidgetProps) {
  const all = checkins(rows);
  const lanes = lanesOf(all);
  const [laneId, setLane] = useState<string | null>(null);
  const [focus, setFocus] = useState<BodyRegion | null>(null);
  if (!all.length) return <Empty text="No check-ins yet. Upload today's photo to a body lane." />;

  const lane = lanes.find((l) => l.id === laneId) ?? lanes[0];
  const days = all.filter((r) => String(r.lane_id ?? r.lane ?? "") === lane.id);
  const regions = regionsIn(days);
  const main = (regions.includes(String(settings.headline) as BodyRegion) ? settings.headline : regions[0] ?? "abs") as BodyRegion;
  const last = days.at(-1)!;
  const now = scoreOf(last, main);
  const since = deltaOf(last.vs_day1, main);

  const head = (
    <div className="flex items-baseline gap-2">
      <span className="font-mono text-3xl tabular-nums">{now ?? "–"}<span className="text-base text-muted-foreground">/10</span></span>
      <span className={`font-mono text-sm tabular-nums ${deltaTone(since)}`}>{sinceDay1(since)}</span>
    </div>
  );

  if (size === "compact") {
    const pts = days.map((r) => scoreOf(r, main));
    return (
      <div className="flex h-full flex-col justify-end gap-1 px-3 pb-2 pt-7">
        <p className={stat}>{REGION_LABEL[main]} · day {days.length}</p>
        {head}
        <Spark values={pts} color={REGION_COLOR[main]} />
      </div>
    );
  }

  const x = (i: number) => PAD.l + (days.length === 1 ? (W - PAD.l - PAD.r) / 2 : (i / (days.length - 1)) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (1 - (v - 1) / 9) * (H - PAD.t - PAD.b);
  const ticks = days.length <= 7 ? days.map((_, i) => i) : [0, Math.floor((days.length - 1) / 2), days.length - 1];

  return (
    <div className="@container h-full overflow-auto [scrollbar-gutter:stable]">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className={stat}>{REGION_LABEL[main]} · {lane.name} · {days.length} {days.length === 1 ? "day" : "days"}</p>
            {head}
          </div>
          {lanes.length > 1 && (
            <div className="flex gap-px border bg-border text-xs" role="tablist">
              {lanes.map((l) => (
                <button key={l.id} type="button" role="tab" aria-selected={l.id === lane.id} onClick={() => setLane(l.id)} className={`px-2.5 py-1 ${l.id === lane.id ? "bg-muted text-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}>{l.name}</button>
              ))}
            </div>
          )}
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label={`${REGION_LABEL[main]} definition by day`}>
          {[1, 4, 7, 10].map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="stroke-border" strokeDasharray={v === 1 ? undefined : "2 4"} />
              <text x={PAD.l - 6} y={y(v) + 3} textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">{v}</text>
            </g>
          ))}
          {ticks.map((i) => <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="fill-muted-foreground font-mono text-[10px]">{shortDay(days[i].day)}</text>)}
          {regions.map((k) => {
            const dim = focus && focus !== k;
            const pts = days.map((r, i) => ({ i, v: scoreOf(r, k), ok: r.comparable !== false }));
            // The line only joins comparable shots; the others float as hollow dots.
            const line = pts.filter((p) => p.v !== null && p.ok).map((p) => `${x(p.i)},${y(p.v!)}`).join(" ");
            return (
              <g key={k} style={{ opacity: dim ? 0.15 : 1 }} className="transition-opacity">
                <polyline points={line} fill="none" stroke={REGION_COLOR[k]} strokeWidth={k === main ? 2.5 : 1.5} strokeLinejoin="round" strokeLinecap="round" />
                {pts.map((p) => p.v !== null && (
                  <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={k === main ? 3.5 : 2.5} fill={p.ok ? REGION_COLOR[k] : "var(--background)"} stroke={REGION_COLOR[k]} strokeWidth={1.5}>
                    <title>{`${REGION_LABEL[k]} ${p.v}/10 on ${days[p.i].day}${p.ok ? "" : " (not comparable to day 1)"}`}</title>
                  </circle>
                ))}
              </g>
            );
          })}
        </svg>

        <div className="grid grid-cols-2 gap-px border bg-border @md:grid-cols-3 @2xl:grid-cols-6">
          {regions.map((k) => (
            <button key={k} type="button" onMouseEnter={() => setFocus(k)} onMouseLeave={() => setFocus(null)} onFocus={() => setFocus(k)} onBlur={() => setFocus(null)} className="bg-background px-3 py-2 text-left transition-colors hover:bg-muted/50">
              <span className={`${stat} flex items-center gap-1.5`}><span className="size-2 rounded-full" style={{ background: REGION_COLOR[k] }} />{REGION_LABEL[k]}</span>
              <span className="font-mono text-lg tabular-nums">{scoreOf(last, k) ?? "–"}</span>
              <span className={`ml-1.5 font-mono text-xs tabular-nums ${deltaTone(deltaOf(last.vs_day1, k))}`}>{signed(deltaOf(last.vs_day1, k))}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">{last.comparable === false ? "Today's shot does not match day 1 (angle or light), so it is not in the trend. " : ""}{ESTIMATE}</p>
      </div>
    </div>
  );
}

function Spark({ values, color }: { values: (number | null)[]; color: string }) {
  const pts = values.map((v, i) => (v === null ? null : `${values.length === 1 ? 50 : (i / (values.length - 1)) * 100},${30 - ((v - 1) / 9) * 28}`)).filter(Boolean);
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-8 w-full" aria-hidden="true">
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
