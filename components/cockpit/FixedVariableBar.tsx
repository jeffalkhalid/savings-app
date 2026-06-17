import { eur } from "@/lib/cockpit/format";

export function FixedVariableBar({
  fixe,
  variable,
  fixedShare,
  onDrill,
}: {
  fixe: number;
  variable: number;
  fixedShare: number;
  onDrill: () => void;
}) {
  const pct = Math.round(fixedShare * 100);
  return (
    <button type="button" onClick={onDrill} className="w-full text-left mb-6">
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-xs uppercase tracking-[0.1em] text-ink-muted">
          Charges fixes
        </span>
        <span className="font-mono-num text-sm">
          {eur(fixe)}
          <span className="text-ink-muted"> /mois · {pct}%</span>
        </span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-rule">
        <div className="bg-ink" style={{ width: `${pct}%` }} />
        <div className="bg-emerald" style={{ width: `${100 - pct}%` }} />
      </div>
      <div className="text-[11px] text-ink-muted mt-1.5">
        {eur(fixe)} incompressible · {eur(variable)} optimisable
      </div>
    </button>
  );
}
