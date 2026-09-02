"use client";

import { useEffect, useMemo, useState } from "react";
import { simulateMonteCarlo } from "@/lib/cockpit/monte-carlo";
import {
  projectMonthly,
  summarise,
  firstShockMonth,
  type Shock,
} from "@/lib/cockpit/shock";
import { ProjectionHero } from "./ProjectionHero";
import { ProjectionChart } from "./ProjectionChart";
import { ProjectionControls } from "./ProjectionControls";
import { ProjectionModeToggle } from "./ProjectionModeToggle";
import { RiskProfilePicker } from "./RiskProfilePicker";
import { MonteCarloChart } from "./MonteCarloChart";
import { MonteCarloHero } from "./MonteCarloHero";
import { ScenarioPanel } from "./ScenarioPanel";
import { ShockSheet } from "./ShockSheet";

export function ProjectionView({
  avgFlow,
  initial,
  monthlyIncome,
  txnError,
}: {
  avgFlow: number;
  initial: number;
  monthlyIncome: number;
  txnError: string | null;
}) {
  const [monthlyFlow, setMonthlyFlow] = useState(0);
  const [flowTouched, setFlowTouched] = useState(false);
  const [rate, setRate] = useState(0.05);
  const [years, setYears] = useState(10);
  const [mode, setMode] = useState<"deterministe" | "montecarlo">(
    "deterministe"
  );
  const [sigma, setSigma] = useState(0.12);
  const [profile, setProfile] = useState<string | null>(null);
  const [shocks, setShocks] = useState<Shock[]>([]);
  const [showShockSheet, setShowShockSheet] = useState(false);

  useEffect(() => {
    if (!flowTouched && avgFlow) setMonthlyFlow(avgFlow);
  }, [avgFlow, flowTouched]);

  const annualContribution = monthlyFlow * 12;

  const monthlyBase = useMemo(
    () =>
      projectMonthly({
        initial,
        monthlyFlow,
        monthlyIncome,
        rate,
        years,
        shocks: [],
      }),
    [initial, monthlyFlow, monthlyIncome, rate, years]
  );
  const monthlyShocked = useMemo(
    () =>
      shocks.length
        ? projectMonthly({
            initial,
            monthlyFlow,
            monthlyIncome,
            rate,
            years,
            shocks,
          })
        : null,
    [initial, monthlyFlow, monthlyIncome, rate, years, shocks]
  );
  const summary = useMemo(
    () =>
      monthlyShocked
        ? summarise(monthlyBase, monthlyShocked, firstShockMonth(shocks))
        : null,
    [monthlyBase, monthlyShocked, shocks]
  );
  // Le hero annonce la fin de la trajectoire réellement affichée : s'il y a
  // des chocs, c'est celle qui les porte.
  const projected =
    (monthlyShocked ?? monthlyBase)[
      (monthlyShocked ?? monthlyBase).length - 1
    ].value;

  const points = useMemo(
    () =>
      simulateMonteCarlo({
        initial,
        annualContribution,
        mu: rate,
        sigma,
        years,
        runs: 1000,
        seed: 42,
      }),
    [initial, annualContribution, rate, sigma, years]
  );

  const setFlow = (v: number) => {
    setFlowTouched(true);
    setMonthlyFlow(v);
  };
  const applyProfile = (mu: number, sig: number, key: string) => {
    setRate(mu);
    setSigma(sig);
    setProfile(key);
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

      <ProjectionModeToggle mode={mode} onMode={setMode} />

      {mode === "deterministe" ? (
        <>
          <ProjectionHero
            projected={projected}
            initial={initial}
            years={years}
            note={shocks.length > 0 ? " · avec chocs" : undefined}
          />
          <ProjectionChart series={monthlyBase} shocked={monthlyShocked} />
          <ProjectionControls
            monthlyFlow={monthlyFlow}
            onMonthlyFlow={setFlow}
            avgFlow={avgFlow}
            rate={rate}
            onRate={setRate}
            years={years}
            onYears={setYears}
          />
          <ScenarioPanel
            shocks={shocks}
            summary={summary}
            monthlyIncome={monthlyIncome}
            onAdd={() => setShowShockSheet(true)}
            onRemove={(i) => setShocks((xs) => xs.filter((_, j) => j !== i))}
          />
        </>
      ) : (
        <>
          <MonteCarloHero points={points} years={years} />
          <MonteCarloChart points={points} />
          <RiskProfilePicker activeKey={profile} onSelect={applyProfile} />
          <ProjectionControls
            monthlyFlow={monthlyFlow}
            onMonthlyFlow={setFlow}
            avgFlow={avgFlow}
            rate={rate}
            onRate={(r) => {
              setRate(r);
              setProfile(null);
            }}
            years={years}
            onYears={setYears}
          />
          <label className="grid gap-1.5 text-[13px] text-ink-muted mt-5">
            Volatilité annuelle · {(sigma * 100).toFixed(0)} %
            <input
              type="range"
              min={0}
              max={25}
              step={1}
              value={sigma * 100}
              onChange={(e) => {
                setSigma(Number(e.target.value) / 100);
                setProfile(null);
              }}
            />
          </label>
        </>
      )}

      {showShockSheet && (
        <ShockSheet
          years={years}
          monthlyIncome={monthlyIncome}
          onAdd={(s) => setShocks((xs) => [...xs, s])}
          onClose={() => setShowShockSheet(false)}
        />
      )}
    </>
  );
}
