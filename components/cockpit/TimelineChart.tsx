"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { eur } from "@/lib/cockpit/format";
import type { MonthTotals } from "@/lib/cockpit/timeline";

const shortMonth = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString("fr-FR", { month: "short" });

export function TimelineChart({ series }: { series: MonthTotals[] }) {
  if (series.length < 2) return null;
  return (
    <div className="bg-card rounded-2xl p-4 mb-4">
      <div className="text-[11px] uppercase tracking-wide text-ink-muted mb-2">
        Revenus, dépenses et épargne
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10, fill: "#9A8E7C" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={shortMonth}
            />
            <YAxis hide />
            <Tooltip
              formatter={(v: number) => eur(v)}
              labelFormatter={(m: string) => shortMonth(m)}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line
              type="monotone"
              dataKey="revenus"
              name="Revenus"
              stroke="#3E7D5A"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="depenses"
              name="Dépenses"
              stroke="#C75B39"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="epargne"
              name="Épargne"
              stroke="#4A6FA5"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
