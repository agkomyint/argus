"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Vehicle = { lane: number; dur: number; delay: number; label: string; size: string; conf: number };

const CAR = "w-[9%] h-[6%]";
const TRUCK = "w-[14%] h-[7.5%]";
const BUS = "w-[16%] h-[8%]";

const VEHICLES: Vehicle[] = [
  { lane: 0, dur: 9, delay: 0, label: "car", size: CAR, conf: 98 },
  { lane: 0, dur: 11, delay: 5, label: "truck", size: TRUCK, conf: 94 },
  { lane: 1, dur: 8, delay: 2, label: "car", size: CAR, conf: 97 },
  { lane: 1, dur: 12, delay: 7, label: "bus", size: BUS, conf: 91 },
  { lane: 2, dur: 10, delay: 1, label: "car", size: CAR, conf: 96 },
  { lane: 2, dur: 9, delay: 6, label: "car", size: CAR, conf: 99 },
  { lane: 3, dur: 13, delay: 3, label: "truck", size: TRUCK, conf: 93 },
  { lane: 3, dur: 8, delay: 8, label: "car", size: CAR, conf: 95 },
];

const LANE_TOP = ["top-[34%]", "top-[44%]", "top-[58%]", "top-[68%]"];

const MAP_POINTS: [number, number][] = [
  [18, 62], [30, 48], [44, 40], [58, 44], [70, 30], [82, 36], [36, 70], [52, 62], [66, 58], [78, 66],
];

export function HeroVisual() {
  const [tick, setTick] = useState(0);
  const [count, setCount] = useState(1284);
  const [flow, setFlow] = useState(42);

  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1);
      setCount((c) => c + 1 + Math.floor(Math.random() * 3));
      setFlow((f) => Math.max(28, Math.min(64, f + Math.round((Math.random() - 0.5) * 8))));
    }, 1200);
    return () => clearInterval(id);
  }, []);

  const livePoints = 3 + (tick % (MAP_POINTS.length - 2));

  return (
    <div className="grid border lg:grid-cols-[1.75fr_1fr] lg:divide-x">
      {/* Frame entering the system */}
      <div className="relative overflow-hidden bg-obsidian @container">
        <div className="relative aspect-[16/10]">
          <div className="absolute inset-x-0 bottom-[22%] top-[28%] bg-road" />
          <div className="absolute inset-x-0 top-[51%] h-px bg-yellow-400/50" />
          {["top-[39%]", "top-[63%]"].map((t) => (
            <div key={t} className={cn("absolute inset-x-0 h-px bg-[repeating-linear-gradient(90deg,var(--color-white)_0_14px,transparent_14px_36px)] opacity-15", t)} />
          ))}

          {VEHICLES.map((v, i) => (
            <div
              key={i}
              className={cn("absolute left-0", v.size, LANE_TOP[v.lane], v.lane >= 2 ? "animate-drive-left" : "animate-drive-right")}
              style={{ animationDuration: `${v.dur}s`, animationDelay: `${v.delay}s` }}
            >
              <div className="size-full bg-muted-foreground/25" />
              <div className="absolute -inset-1 border border-signal">
                <span className="absolute -left-px -top-3.5 whitespace-nowrap bg-signal px-1 font-mono text-[8px] font-medium leading-3.5 text-obsidian">
                  {v.label} {v.conf}%
                </span>
              </div>
            </div>
          ))}

          <div className="absolute inset-x-0 h-px animate-scan bg-electric/70" />

          <div className="absolute left-3 top-3 flex items-center gap-2 font-mono text-[10px] text-white/80">
            <span className="size-1.5 animate-pulse rounded-full bg-destructive" />
            REC · CAM-0427 · HWY-9 NB
          </div>
          <div className="absolute right-3 top-3 font-mono text-[10px] text-signal">INFERENCE 18 ms</div>
        </div>
      </div>

      {/* Map + data product */}
      <div className="grid divide-y border-t lg:border-t-0">
        <div className="bg-obsidian">
          <div className="flex justify-between px-4 pt-3 font-mono text-[10px] text-muted-foreground">
            <span>MAP</span>
            <span className="text-signal">{livePoints} live</span>
          </div>
          <svg viewBox="0 0 100 80" className="h-36 w-full" role="img" aria-label="Live detections plotted on a map">
            <path d="M20 78 C34 66 48 62 62 58 S88 66 98 62" fill="none" className="stroke-white/15" strokeWidth=".8" />
            <path d="M5 66 C25 60 30 40 50 42 S80 30 96 28" fill="none" className="animate-flow stroke-electric/70" strokeWidth="1" strokeDasharray="4 3" />
            {MAP_POINTS.slice(0, livePoints).map(([x, y], i) => (
              <g key={i}>
                <circle cx={x} cy={y} r="2.4" className="origin-center animate-ping-slow fill-signal/50 [transform-box:fill-box]" />
                <circle cx={x} cy={y} r="1.2" className="fill-signal" />
              </g>
            ))}
          </svg>
        </div>

        <dl className="grid grid-cols-2 divide-x">
          <Stat label="VEHICLES TODAY" value={count.toLocaleString()} />
          <Stat label="FLOW / MIN" value={String(flow)} className="text-signal" />
        </dl>

        <div className="bg-obsidian px-4 py-3">
          <div className="mb-2 flex justify-between font-mono text-[10px] text-muted-foreground">
            <span>vehicle-traffic-dashboard</span>
            <span className="text-electric">streaming</span>
          </div>
          <div className="flex h-10 items-end gap-0.5">
            {Array.from({ length: 28 }).map((_, i) => (
              <span
                key={i}
                className="flex-1 bg-electric/70 transition-[height] duration-700"
                style={{ height: `${25 + ((Math.sin((i + tick) * 0.7) + 1) / 2) * 75}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="px-4 py-3">
      <dt className="font-mono text-[10px] text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 font-mono text-2xl tabular-nums", className)}>{value}</dd>
    </div>
  );
}
