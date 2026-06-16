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
    <div className="h-56 mb-6">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="year"
            tick={{ fontSize: 10, fill: "#6B6E76" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(y: number) => `${y}a`}
          />
          <YAxis hide />
          <Tooltip
            formatter={(v: number) => eur(v)}
            labelFormatter={(y) => `Année ${y}`}
            labelStyle={{ color: "#1A1B1F" }}
          />
          <Area
            type="monotone"
            dataKey="p90"
            stroke="none"
            fill="#1B5E40"
            fillOpacity={0.18}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="p10"
            stroke="none"
            fill="#FAF8F4"
            fillOpacity={1}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="p50"
            stroke="#1B5E40"
            strokeWidth={2}
            fill="none"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
