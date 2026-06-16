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
    <div className="border-b-2 border-ink pb-5 mb-5">
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-ink-muted mb-1.5">
        Patrimoine projeté · {years} ans
      </div>
      <div className="font-display text-emerald text-5xl leading-none">
        {eur(projected)}
      </div>
      {mult !== null && (
        <div className="font-mono-num text-sm mt-2 text-ink-muted">
          ×{mult.toFixed(1)} le patrimoine actuel
        </div>
      )}
    </div>
  );
}
