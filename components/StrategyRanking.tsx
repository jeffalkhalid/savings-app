"use client";

import type { SimulationResult, StrategyKey } from "@/lib/types";
import { STRATEGIES } from "@/lib/strategies";
import { formatEuro, formatMultiplier } from "@/lib/format";

interface Props {
  results: SimulationResult[];
  selected: StrategyKey;
  onSelect: (k: StrategyKey) => void;
}

export function StrategyRanking({ results, selected, onSelect }: Props) {
  const sorted = [...results].sort(
    (a, b) => b.summary.net_total - a.summary.net_total,
  );
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const spread = best.summary.net_total - worst.summary.net_total;

  return (
    <section>
      <div className="flex items-end justify-between mb-6 gap-4">
        <div>
          <h2 className="font-display text-3xl lg:text-4xl text-ink">
            Classement net
          </h2>
          <p className="text-sm text-ink-muted mt-1">
            Après fiscalité de sortie. Écart entre la meilleure et la pire :{" "}
            <span className="font-mono-num font-medium text-ink">
              {formatEuro(spread)}
            </span>
            .
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {sorted.map((r, idx) => {
          const meta = STRATEGIES[r.strategy];
          const isSelected = r.strategy === selected;
          const isBest = idx === 0;
          return (
            <button
              key={r.strategy}
              onClick={() => onSelect(r.strategy)}
              className={`group text-left p-5 border transition-all relative ${
                isSelected
                  ? "border-ink bg-ink/[0.02]"
                  : "border-rule hover:border-ink/40 bg-paper"
              }`}
              style={{
                borderLeftWidth: "4px",
                borderLeftColor: meta.color,
              }}
            >
              {isBest && (
                <div className="absolute -top-2 -right-2 bg-emerald text-paper text-[10px] font-medium tracking-wider px-2 py-0.5 uppercase">
                  Meilleur
                </div>
              )}
              <div className="flex items-baseline justify-between gap-2 mb-3">
                <div className="font-mono-num text-xs text-ink-muted">
                  #{idx + 1}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-ink-muted">
                  Stratégie {r.strategy}
                </div>
              </div>
              <div className="font-display text-lg text-ink leading-tight mb-1">
                {meta.short}
              </div>
              <div className="font-mono-num text-2xl text-ink font-medium mt-3">
                {formatEuro(r.summary.net_total)}
              </div>
              <div className="flex items-baseline justify-between mt-2 text-xs text-ink-muted">
                <span>Multiplicateur</span>
                <span className="font-mono-num">
                  {formatMultiplier(r.summary.multiplier)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
