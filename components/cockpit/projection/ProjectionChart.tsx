"use client";

import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { eur } from "@/lib/cockpit/format";
import type { MonthPoint } from "@/lib/cockpit/shock";

/**
 * Trajectoire de patrimoine, au mois.
 *
 * L'axe est en mois et non en années : un choc de six mois est en partie
 * résorbé à l'anniversaire suivant, donc un tracé annuel masquerait le creux
 * que cet écran existe pour montrer. Les graduations restent annuelles pour
 * rester lisibles.
 *
 * Le domaine Y utilise une fonction pour ancrer l'étage à zéro quand la
 * trajectoire reste positive (comportement par défaut recharts), tout en
 * admettant les valeurs négatives quand un choc érode le capital.
 */
export function ProjectionChart({
  series,
  shocked,
}: {
  series: MonthPoint[];
  shocked?: MonthPoint[] | null;
}) {
  const shockedByMonth = new Map((shocked ?? []).map((p) => [p.month, p.value]));
  const data = series.map((p) => ({
    month: p.month,
    value: p.value,
    shocked: shockedByMonth.get(p.month),
  }));
  const ticks = series
    .filter((p) => p.month % 12 === 0)
    .map((p) => p.month);

  return (
    <div className="bg-card rounded-2xl p-4 mb-4">
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3E7D5A" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#3E7D5A" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="month"
              type="number"
              domain={[0, series[series.length - 1]?.month ?? 0]}
              ticks={ticks}
              tick={{ fontSize: 10, fill: "#9A8E7C" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(m: number) => `${m / 12}a`}
            />
            <YAxis hide domain={[(min: number) => Math.min(0, min), "auto"]} />
            <Tooltip
              formatter={(v: number, name: string) =>
                [eur(v), name === "shocked" ? "avec chocs" : "référence"]
              }
              labelFormatter={(m: number) => `Mois ${m}`}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#3E7D5A"
              strokeWidth={2.5}
              fill="url(#projGrad)"
            />
            {shocked && shocked.length > 0 && (
              <Line
                type="monotone"
                dataKey="shocked"
                stroke="#B45342"
                strokeWidth={2}
                dot={false}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
