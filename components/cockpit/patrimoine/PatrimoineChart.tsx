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
      <div className="bg-card rounded-2xl p-5 mb-4 text-ink-muted text-sm text-center">
        Pas encore assez d&apos;historique pour tracer une courbe.
      </div>
    );
  }
  return (
    <div className="bg-card rounded-2xl p-4 mb-4">
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={series}
            margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
          >
            <defs>
              <linearGradient id="patGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3E7D5A" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#3E7D5A" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#9A8E7C" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis hide />
            <Tooltip formatter={(v: number) => eur(v)} />
            <Area
              type="monotone"
              dataKey="total"
              stroke="#3E7D5A"
              strokeWidth={2.5}
              fill="url(#patGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
