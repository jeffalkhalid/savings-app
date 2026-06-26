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
  const valueCls = "text-accent font-semibold";
  return (
    <section className="grid gap-5 mt-5">
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
        <span className="flex justify-between">
          <span>Rendement annuel</span>
          <span className={valueCls}>{(rate * 100).toFixed(1)} %</span>
        </span>
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
        <span className="flex justify-between">
          <span>Horizon</span>
          <span className={valueCls}>{years} ans</span>
        </span>
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
