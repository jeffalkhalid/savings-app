"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { MonthTotals } from "@/lib/cockpit/timeline";

const shortMonth = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString("fr-FR", { month: "short" });

/**
 * Le taux d'épargne a sa propre carte : superposé aux euros, il serait plat et
 * illisible.
 */
export function SavingsRateChart({ series }: { series: MonthTotals[] }) {
  if (series.length < 2) return null;
  const data = series.map((s) => ({
    month: s.month,
    taux: Math.round(s.tauxEpargne * 1000) / 10,
  }));
  return (
    <div className="bg-card rounded-2xl p-4 mb-4">
      <div className="text-[11px] uppercase tracking-wide text-ink-muted mb-2">
        Taux d&apos;épargne
      </div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10, fill: "#9A8E7C" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={shortMonth}
            />
            <YAxis hide />
            <Tooltip
              formatter={(v: number) => `${v} %`}
              labelFormatter={(m: string) => shortMonth(m)}
            />
            <Line
              type="monotone"
              dataKey="taux"
              name="Taux d'épargne"
              stroke="#E3B23C"
              strokeWidth={2.5}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
