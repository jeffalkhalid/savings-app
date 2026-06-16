"use client";

import { eur } from "@/lib/cockpit/format";

export function ProjectionControls({
  monthlyFlow,
  onMonthlyFlow,
  avgFlow,
  rate,
  onRate,
  years,
  onYears,
}: {
  monthlyFlow: number;
  onMonthlyFlow: (v: number) => void;
  avgFlow: number;
  rate: number;
  onRate: (v: number) => void;
  years: number;
  onYears: (v: number) => void;
}) {
  const labelCls = "grid gap-1.5 text-[13px] text-ink-muted";
  return (
    <section className="grid gap-5">
      <label className={labelCls}>
        Épargne mensuelle (€)
        <input
          className="border border-rule rounded-lg px-3 py-3 bg-white text-base w-full"
          type="text"
          inputMode="decimal"
          value={String(Math.round(monthlyFlow))}
          onChange={(e) =>
            onMonthlyFlow(parseFloat(e.target.value.replace(",", ".")) || 0)
          }
        />
        <span className="text-[11px] text-ink-muted">
          Moyenne observée : {eur(avgFlow)}/mois
        </span>
      </label>
      <label className={labelCls}>
        Rendement annuel · {(rate * 100).toFixed(1)} %
        <input
          type="range"
          min={0}
          max={10}
          step={0.5}
          value={rate * 100}
          onChange={(e) => onRate(Number(e.target.value) / 100)}
        />
      </label>
      <label className={labelCls}>
        Horizon · {years} ans
        <input
          type="range"
          min={1}
          max={40}
          step={1}
          value={years}
          onChange={(e) => onYears(Number(e.target.value))}
        />
      </label>
    </section>
  );
}
