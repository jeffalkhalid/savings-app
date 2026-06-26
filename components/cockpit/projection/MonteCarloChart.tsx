"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { eur } from "@/lib/cockpit/format";
import type { McPoint } from "@/lib/cockpit/monte-carlo";

export function MonteCarloChart({ points }: { points: McPoint[] }) {
  return (
    <div className="bg-card rounded-2xl p-4 mb-4">
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <XAxis
              dataKey="year"
              tick={{ fontSize: 10, fill: "#9A8E7C" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(y: number) => `${y}a`}
            />
            <YAxis hide />
            <Tooltip
              formatter={(v: number) => eur(v)}
              labelFormatter={(y) => `Année ${y}`}
            />
            <Area
              type="monotone"
              dataKey="p90"
              stroke="#C9A24B"
              strokeWidth={1.3}
              strokeDasharray="3 3"
              fill="#3E7D5A"
              fillOpacity={0.14}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="p10"
              stroke="#B0805F"
              strokeWidth={1.3}
              strokeDasharray="3 3"
              fill="none"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="p50"
              stroke="#3E7D5A"
              strokeWidth={2.5}
              fill="none"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-4 mt-2 text-[10.5px] text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-0.5 rounded-full bg-emerald inline-block" />
          Médian
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-0.5 rounded-full bg-gold inline-block" />
          Favorable (p90)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-0.5 rounded-full inline-block" style={{ background: "#B0805F" }} />
          Prudent (p10)
        </span>
      </div>
    </div>
  );
}
