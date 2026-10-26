"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TICK, TOOLTIP } from "@/components/widgets/chart-style";

export type ActivityPoint = { day: string; observations: number; files: number };

/** Data arriving per day: observations (what ARGUS extracted) and uploaded files. */
export function ActivityChart({ data }: { data: ActivityPoint[] }) {
  return (
    <div className="h-52 min-w-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="act-obs" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--electric)" stopOpacity={0.45} />
              <stop offset="1" stopColor="var(--electric)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} tick={TICK} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis allowDecimals={false} tick={TICK} axisLine={false} tickLine={false} />
          <Tooltip {...TOOLTIP} />
          <Area type="monotone" dataKey="observations" stroke="var(--electric)" strokeWidth={2} fill="url(#act-obs)" isAnimationActive={false} />
          <Area type="monotone" dataKey="files" stroke="var(--signal)" strokeWidth={2} fill="none" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
