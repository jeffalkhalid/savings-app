"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useAuth,
  useAllTransactions,
  usePatrimoineSummary,
} from "@/lib/cockpit/hooks";
import { averageMonthlyNet, projectNetWorth } from "@/lib/cockpit/projection";
import { ProjectionTabs } from "@/components/cockpit/projection/ProjectionTabs";
import { ProjectionHero } from "@/components/cockpit/projection/ProjectionHero";
import { ProjectionChart } from "@/components/cockpit/projection/ProjectionChart";
import { ProjectionControls } from "@/components/cockpit/projection/ProjectionControls";

export default function ProjectionPage() {
  const user = useAuth();
  const { txns } = useAllTransactions();
  const { lines } = usePatrimoineSummary(user.id);

  const avgFlow = useMemo(() => averageMonthlyNet(txns), [txns]);
  const initial = lines.reduce((a, l) => a + Number(l.total_value), 0);

  const [monthlyFlow, setMonthlyFlow] = useState(0);
  const [flowTouched, setFlowTouched] = useState(false);
  const [rate, setRate] = useState(0.05);
  const [years, setYears] = useState(10);

  // Seed the monthly flow from the observed average once it loads, until edited.
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
    <main className="max-w-[600px] mx-auto px-5 pt-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl">Projection</h1>
      </header>

      <ProjectionTabs />

      {initial === 0 && (
        <p className="text-ink-muted text-sm mb-4">
          Ajoute des assets dans Patrimoine pour projeter sur une base réelle.
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
    </main>
  );
}
