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
    <div className="bg-card rounded-[26px] p-6 mb-4">
      <div className="text-[11px] uppercase tracking-[0.12em] text-ink-muted mb-2">
        Patrimoine médian (P50) · {years} ans
      </div>
      <div className="font-display text-emerald text-4xl leading-none">
        {eur(last.p50)}
      </div>
      <div className="font-mono-num text-sm mt-2 text-ink2">
        P10 {eur(last.p10)} – P90 {eur(last.p90)}
      </div>
    </div>
  );
}
