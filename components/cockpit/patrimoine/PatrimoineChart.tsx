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

export function PatrimoineChart({
  series,
}: {
  series: { date: string; total: number }[];
}) {
  if (series.length < 2) {
    return (
      <p className="text-ink-muted text-sm py-8 text-center">
        Pas encore assez d&apos;historique pour tracer une courbe.
      </p>
    );
  }
  return (
    <div className="h-56 mb-6">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="patGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1B5E40" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#1B5E40" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "#6B6E76" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis hide />
          <Tooltip
            formatter={(v: number) => eur(v)}
            labelStyle={{ color: "#1A1B1F" }}
          />
          <Area
            type="monotone"
            dataKey="total"
            stroke="#1B5E40"
            strokeWidth={2}
            fill="url(#patGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
