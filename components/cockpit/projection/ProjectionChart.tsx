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
    <div className="bg-card rounded-2xl p-4 mb-4">
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3E7D5A" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#3E7D5A" stopOpacity={0} />
              </linearGradient>
            </defs>
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
              dataKey="value"
              stroke="#3E7D5A"
              strokeWidth={2.5}
              fill="url(#projGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
