import { eur } from "@/lib/cockpit/format";
import { STRATEGIES } from "@/lib/strategies";
import type { SimulationResult } from "@/lib/types";

export function StrategyRankList({ ranked }: { ranked: SimulationResult[] }) {
  return (
    <section>
      <div className="text-xs uppercase tracking-[0.1em] text-ink-muted mb-2">
        Classement (net de sortie)
      </div>
      {ranked.map((r, i) => {
        const meta = STRATEGIES[r.strategy];
        const winner = i === 0;
        return (
          <div
            key={r.strategy}
            className={`py-3 border-b border-rule ${
              winner ? "border-l-2 border-l-emerald pl-3" : ""
            }`}
          >
            <div className="flex justify-between items-baseline gap-2">
              <div className="text-sm font-medium">{meta.label}</div>
              <strong
                className={`font-mono-num text-sm ${
                  winner ? "text-emerald" : "text-ink"
                }`}
              >
                {eur(r.summary.net_total)}
              </strong>
            </div>
            <div className="flex justify-between items-baseline gap-2 mt-0.5">
              <div className="text-[11px] text-ink-muted">{meta.short}</div>
              <div className="font-mono-num text-[11px] text-ink-muted">
                ×{r.summary.multiplier.toFixed(2)}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
