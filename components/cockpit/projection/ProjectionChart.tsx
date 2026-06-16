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

export function ProjectionChart({
  series,
}: {
  series: { year: number; value: number }[];
}) {
  return (
    <div className="h-56 mb-6">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1B5E40" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#1B5E40" stopOpacity={0} />
            </linearGradient>
          </defs>
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
            dataKey="value"
            stroke="#1B5E40"
            strokeWidth={2}
            fill="url(#projGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
