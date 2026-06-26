import { eur } from "@/lib/cockpit/format";
import { STRATEGIES } from "@/lib/strategies";
import type { SimulationResult } from "@/lib/types";

export function StrategyRankList({ ranked }: { ranked: SimulationResult[] }) {
  return (
    <section>
      <div className="font-display text-[15px] mb-2">Classement (net de sortie)</div>
      <div className="grid gap-2">
        {ranked.map((r, i) => {
          const meta = STRATEGIES[r.strategy];
          const winner = i === 0;
          return (
            <div key={r.strategy} className="bg-card rounded-2xl p-3.5">
              <div className="flex items-center gap-3">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-bold shrink-0 ${
                    winner ? "bg-emerald text-[#FBF3EC]" : "bg-tile text-ink-muted"
                  }`}
                >
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">
                      {meta.label}
                    </span>
                    {winner && (
                      <span className="text-[9px] font-bold uppercase tracking-[0.06em] bg-emerald text-[#FBF3EC] px-1.5 py-0.5 rounded">
                        Top
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-ink-muted mt-0.5">
                    {meta.short} · ×{r.summary.multiplier.toFixed(2)}
                  </div>
                </div>
                <strong className="font-mono-num text-base shrink-0">
                  {eur(r.summary.net_total)}
                </strong>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
