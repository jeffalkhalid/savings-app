import { eur } from "@/lib/cockpit/format";
import type { McPoint } from "@/lib/cockpit/monte-carlo";

export function MonteCarloHero({
  points,
  years,
}: {
  points: McPoint[];
  years: number;
}) {
  const last = points[points.length - 1];
  return (
    <div className="border-b-2 border-ink pb-5 mb-5">
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-ink-muted mb-1.5">
        Patrimoine médian (P50) · {years} ans
      </div>
      <div className="font-display text-emerald text-5xl leading-none">
        {eur(last.p50)}
      </div>
      <div className="font-mono-num text-sm mt-2 text-ink-muted">
        P10 {eur(last.p10)} – P90 {eur(last.p90)}
      </div>
    </div>
  );
}
