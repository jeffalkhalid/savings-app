"use client";

import { useMemo, useState } from "react";
import { ParameterPanel } from "@/components/ParameterPanel";
import { StrategyRanking } from "@/components/StrategyRanking";
import { ComparisonChart } from "@/components/ComparisonChart";
import { StrategyDetail } from "@/components/StrategyDetail";
import { DataTables } from "@/components/DataTables";
import { simulateAll } from "@/lib/simulator";
import { DEFAULT_PARAMS } from "@/lib/strategies";
import type { SimulationParams, StrategyKey } from "@/lib/types";

export default function Page() {
  const [params, setParams] = useState<SimulationParams>(DEFAULT_PARAMS);
  const [selected, setSelected] = useState<StrategyKey>("F");

  const results = useMemo(() => simulateAll(params), [params]);

  return (
    <main className="max-w-[1600px] mx-auto">
      {/* Header */}
      <header className="border-b border-rule px-6 lg:px-10 py-8 lg:py-12">
        <div className="flex items-baseline justify-between gap-6 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-ink-muted mb-2">
              Épargne salariale &middot; PEG · PER · PEA
            </div>
            <h1 className="font-display text-4xl lg:text-6xl text-ink leading-none">
              Simulateur de stratégies
            </h1>
            <p className="font-display italic text-ink-muted text-lg lg:text-xl mt-4 max-w-2xl">
              Six approches, recyclage récursif, fiscalité de sortie. Tout est
              recalculé en direct.
            </p>
          </div>
          <div className="text-xs text-ink-muted text-right hidden lg:block">
            <div>Horizon {params.years} ans</div>
            <div>Rendement {(params.rate * 100).toFixed(1)}%/an</div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] xl:grid-cols-[400px_1fr]">
        {/* Sidebar */}
        <div className="lg:border-r border-rule lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
          <ParameterPanel params={params} setParams={setParams} />
        </div>

        {/* Main column */}
        <div className="p-6 lg:p-10 space-y-10">
          <StrategyRanking
            results={results}
            selected={selected}
            onSelect={setSelected}
          />
          <ComparisonChart results={results} />
          <StrategyDetail results={results} selected={selected} />
          <DataTables results={results} selected={selected} />

          <footer className="pt-10 border-t border-rule text-xs text-ink-muted leading-relaxed">
            <p className="mb-2">
              Hypothèses simplificatrices : abondement employeur identique
              chaque année, rendement constant, recyclage en année 5 puis
              chaque année. Le modèle ne couvre pas les changements de TMI
              dans le temps, l&apos;effort de versement échelonné, ni les
              plafonds légaux (8 % PASS).
            </p>
            <p>
              Construit à partir des barèmes d&apos;abondement Carrefour
              (cible Khalid). Modifiable dans <code>lib/strategies.ts</code>.
            </p>
          </footer>
        </div>
      </div>
    </main>
  );
}
