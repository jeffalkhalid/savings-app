"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { simulateAll } from "@/lib/simulator";
import { DEFAULT_PARAMS } from "@/lib/strategies";
import { isDefaultBareme } from "@/lib/abondement";
import { buildSimParams, rankByNet } from "@/lib/cockpit/projection-sim";
import { useAuth, useUserSettings } from "@/lib/cockpit/hooks";
import { SimulatorControls } from "./SimulatorControls";
import { StrategyRankList } from "./StrategyRankList";
import { BaremeModal } from "./BaremeModal";

export function SimulatorView({ avgFlow }: { avgFlow: number }) {
  const user = useAuth();
  const { settings, refetch } = useUserSettings(user.id);
  const [volontaire, setVolontaire] = useState(0);
  const [touched, setTouched] = useState(false);
  const [rate, setRate] = useState(DEFAULT_PARAMS.rate);
  const [years, setYears] = useState(DEFAULT_PARAMS.years);
  const [showBareme, setShowBareme] = useState(false);

  const bareme = settings.abondement_bareme;

  useEffect(() => {
    if (!touched && avgFlow > 0) setVolontaire(Math.round(avgFlow * 12));
  }, [avgFlow, touched]);

  const ranked = useMemo(
    () => rankByNet(simulateAll(buildSimParams({ volontaire, rate, years, bareme }))),
    [volontaire, rate, years, bareme]
  );

  const setVol = (v: number) => {
    setTouched(true);
    setVolontaire(v);
  };

  const isDefault = isDefaultBareme(bareme);

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
      <button
        type="button"
        onClick={() => setShowBareme(true)}
        className="flex items-center justify-between w-full border border-rule rounded-lg px-3 py-3 bg-card mb-6 text-left"
      >
        <span className="text-[13px] text-ink-muted">Barème d&apos;abondement</span>
        <span className="flex items-center gap-1 text-[13px] text-ink font-medium">
          {isDefault ? "Carrefour (défaut)" : "Personnalisé"}
          <ChevronRight size={15} className="text-ink-muted" />
        </span>
      </button>
      <StrategyRankList ranked={ranked} />
      <p className="text-[11px] text-ink-muted mt-4">
        {isDefault
          ? "Hypothèses par défaut (abondement Carrefour)."
          : "Calculé avec votre barème d'abondement."}{" "}
        Réglage fin complet sur la page principale.
      </p>
      {showBareme && (
        <BaremeModal
          userId={user.id}
          bareme={bareme}
          onClose={() => setShowBareme(false)}
          onSaved={() => {
            refetch();
            setShowBareme(false);
          }}
        />
      )}
    </>
  );
}
