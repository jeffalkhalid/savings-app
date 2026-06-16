"use client";

import { useEffect, useMemo, useState } from "react";
import { simulateAll } from "@/lib/simulator";
import { DEFAULT_PARAMS } from "@/lib/strategies";
import { buildSimParams, rankByNet } from "@/lib/cockpit/projection-sim";
import { SimulatorControls } from "./SimulatorControls";
import { StrategyRankList } from "./StrategyRankList";

export function SimulatorView({ avgFlow }: { avgFlow: number }) {
  const [volontaire, setVolontaire] = useState(0);
  const [touched, setTouched] = useState(false);
  const [rate, setRate] = useState(DEFAULT_PARAMS.rate);
  const [years, setYears] = useState(DEFAULT_PARAMS.years);

  useEffect(() => {
    if (!touched && avgFlow > 0) setVolontaire(Math.round(avgFlow * 12));
  }, [avgFlow, touched]);

  const ranked = useMemo(
    () => rankByNet(simulateAll(buildSimParams({ volontaire, rate, years }))),
    [volontaire, rate, years]
  );

  const setVol = (v: number) => {
    setTouched(true);
    setVolontaire(v);
  };

  return (
    <>
      <SimulatorControls
        volontaire={volontaire}
        onVolontaire={setVol}
        rate={rate}
        onRate={setRate}
        years={years}
        onYears={setYears}
      />
      <StrategyRankList ranked={ranked} />
      <p className="text-[11px] text-ink-muted mt-4">
        Hypothèses par défaut (abondement Carrefour). Réglage fin complet sur la
        page principale.
      </p>
    </>
  );
}
