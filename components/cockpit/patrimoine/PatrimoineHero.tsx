import { eur } from "@/lib/cockpit/format";

export function PatrimoineHero({
  total,
  delta,
}: {
  total: number;
  delta: number | null;
}) {
  return (
    <div className="border-b-2 border-ink pb-5 mb-5">
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-ink-muted mb-1.5">
        Patrimoine total
      </div>
      <div className="font-display text-emerald text-5xl leading-none">
        {eur(total)}
      </div>
      {delta !== null && (
        <div
          className={`font-mono-num text-sm mt-2 ${
            delta >= 0 ? "text-emerald" : "text-strat-a"
          }`}
        >
          {delta >= 0 ? "▲" : "▼"} {eur(Math.abs(delta))} depuis la dernière
          valorisation
        </div>
      )}
    </div>
  );
}
