import { eur } from "@/lib/cockpit/format";

export function ProjectionHero({
  projected,
  initial,
  years,
}: {
  projected: number;
  initial: number;
  years: number;
}) {
  const mult = initial > 0 ? projected / initial : null;
  return (
    <div className="bg-card rounded-[26px] p-6 mb-4">
      <div className="text-[11px] uppercase tracking-[0.12em] text-ink-muted mb-2">
        Patrimoine projeté · {years} ans
      </div>
      <div className="font-display text-emerald text-4xl leading-none">
        {eur(projected)}
      </div>
      {mult !== null && (
        <div className="font-mono-num text-sm mt-2 text-ink2">
          ×{mult.toFixed(1)} le patrimoine actuel
        </div>
      )}
    </div>
  );
}
