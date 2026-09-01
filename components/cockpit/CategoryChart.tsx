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
import type { Category } from "@/lib/cockpit/types";

const shortMonth = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString("fr-FR", { month: "short" });

export function CategoryChart({
  series,
  categories,
}: {
  series: { month: string; totals: Record<string, number> }[];
  categories: Category[];
}) {
  if (series.length < 2 || !categories.length) return null;

  // recharts veut des clés plates ; on aplatit les totaux par catégorie.
  const data = series.map((s) => ({ month: s.month, ...s.totals }));

  return (
    <div className="bg-card rounded-2xl p-4 mb-4">
      <div className="h-56">
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
              formatter={(v: number) => eur(v)}
              labelFormatter={(m: string) => shortMonth(m)}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {categories.map((c) => (
              <Line
                key={c.id}
                type="monotone"
                dataKey={c.id}
                name={c.name}
                stroke={c.color}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
