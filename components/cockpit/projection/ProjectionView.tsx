"use client";

import { useEffect, useMemo, useState } from "react";
import { projectNetWorth } from "@/lib/cockpit/projection";
import { ProjectionHero } from "./ProjectionHero";
import { ProjectionChart } from "./ProjectionChart";
import { ProjectionControls } from "./ProjectionControls";

export function ProjectionView({
  avgFlow,
  initial,
  txnError,
}: {
  avgFlow: number;
  initial: number;
  txnError: string | null;
}) {
  const [monthlyFlow, setMonthlyFlow] = useState(0);
  const [flowTouched, setFlowTouched] = useState(false);
  const [rate, setRate] = useState(0.05);
  const [years, setYears] = useState(10);

  useEffect(() => {
    if (!flowTouched && avgFlow) setMonthlyFlow(avgFlow);
  }, [avgFlow, flowTouched]);

  const series = useMemo(
    () =>
      projectNetWorth({
        initial,
        annualContribution: monthlyFlow * 12,
        rate,
        years,
      }),
    [initial, monthlyFlow, rate, years]
  );
  const projected = series[series.length - 1].value;

  const setFlow = (v: number) => {
    setFlowTouched(true);
    setMonthlyFlow(v);
  };

  return (
    <>
      {initial === 0 && (
        <p className="text-ink-muted text-sm mb-4">
          Ajoute des assets dans Patrimoine pour projeter sur une base réelle.
        </p>
      )}
      {txnError && (
        <p className="text-ink-muted text-xs mb-4">
          Transactions indisponibles — saisis l&apos;épargne mensuelle
          manuellement.
        </p>
      )}
      <ProjectionHero projected={projected} initial={initial} years={years} />
      <ProjectionChart series={series} />
      <ProjectionControls
        monthlyFlow={monthlyFlow}
        onMonthlyFlow={setFlow}
        avgFlow={avgFlow}
        rate={rate}
        onRate={setRate}
        years={years}
        onYears={setYears}
      />
    </>
  );
}
