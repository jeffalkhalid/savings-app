"use client";

import {
  Line,
  LineChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SimulationResult } from "@/lib/types";
import { STRATEGIES, STRATEGY_KEYS } from "@/lib/strategies";
import { formatEuro } from "@/lib/format";

interface Props {
  results: SimulationResult[];
}

interface ChartRow {
  year: number;
  A?: number;
  B?: number;
  C?: number;
  D?: number;
  E?: number;
  F?: number;
}

export function ComparisonChart({ results }: Props) {
  const years = results[0]?.annual.length ?? 0;
  const data: ChartRow[] = [];
  for (let t = 0; t < years; t++) {
    const row: ChartRow = { year: t };
    for (const r of results) {
      row[r.strategy] = Math.round(r.annual[t].total_gross);
    }
    data.push(row);
  }

  return (
    <section className="border border-rule p-6 lg:p-8 bg-paper">
      <div className="flex items-baseline justify-between flex-wrap gap-3 mb-6">
        <h2 className="font-display text-2xl text-ink">
          Évolution du capital brut
        </h2>
        <p className="text-xs text-ink-muted">
          PEG + PER + bonus PEA (économie IR réinvestie). Hors fiscalité de
          sortie.
        </p>
      </div>
      <div className="h-[420px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
          >
            <CartesianGrid
              stroke="#E5E2DC"
              strokeDasharray="0"
              vertical={false}
            />
            <XAxis
              dataKey="year"
              stroke="#6B6E76"
              tick={{ fontSize: 11, fontFamily: "Geist Mono" }}
              tickLine={false}
              axisLine={{ stroke: "#E5E2DC" }}
              label={{
                value: "Année",
                position: "insideBottom",
                offset: -5,
                style: { fill: "#6B6E76", fontSize: 11 },
              }}
            />
            <YAxis
              stroke="#6B6E76"
              tick={{ fontSize: 11, fontFamily: "Geist Mono" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) =>
                v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`
              }
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#FAF8F4",
                border: "1px solid #1A1B1F",
                borderRadius: 0,
                fontSize: 12,
                fontFamily: "Geist",
              }}
              labelStyle={{
                color: "#1A1B1F",
                fontWeight: 500,
                marginBottom: 4,
              }}
              itemStyle={{ padding: 0, lineHeight: 1.6 }}
              formatter={(value: number, name: string) => [
                formatEuro(value),
                `${name} — ${STRATEGIES[name as keyof typeof STRATEGIES].short}`,
              ]}
              labelFormatter={(label) => `Année ${label}`}
            />
            <Legend
              verticalAlign="top"
              height={36}
              iconType="line"
              iconSize={14}
              formatter={(value) => (
                <span
                  style={{ color: "#1A1B1F", fontSize: 12, marginRight: 12 }}
                >
                  {value} — {STRATEGIES[value as keyof typeof STRATEGIES].short}
                </span>
              )}
            />
            {STRATEGY_KEYS.map((k) => (
              <Line
                key={k}
                type="monotone"
                dataKey={k}
                stroke={STRATEGIES[k].color}
                strokeWidth={k === "F" ? 2.5 : 1.5}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
