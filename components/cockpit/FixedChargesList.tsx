import { eur } from "@/lib/cockpit/format";
import { monthlyAmount, monthlyFixedTotal } from "@/lib/cockpit/fixed";
import type { Recurring } from "@/lib/cockpit/fixed";
import type { Category } from "@/lib/cockpit/types";

export function FixedChargesList({
  recurring,
  categories,
  onBack,
}: {
  recurring: Recurring[];
  categories: Category[];
  onBack: () => void;
}) {
  const active = recurring
    .filter((r) => r.active)
    .sort((a, b) => monthlyAmount(b) - monthlyAmount(a));
  const total = monthlyFixedTotal(recurring);
  const nameOf = (id: string | null) =>
    categories.find((c) => c.id === id)?.name;

  return (
    <section>
      <button onClick={onBack} className="text-ink-muted text-sm mb-2">
        ‹ Retour
      </button>
      <div className="text-xs uppercase tracking-[0.1em] text-ink-muted mb-2">
        Charges fixes
      </div>
      {!active.length && (
        <p className="text-ink-muted text-sm py-4">Aucune charge fixe.</p>
      )}
      {active.map((r) => (
        <div
          key={r.id}
          className="flex justify-between items-center py-2.5 border-b border-rule"
        >
          <div>
            <div className="text-sm">{r.name}</div>
            <div className="text-[11px] text-ink-muted mt-0.5">
              {nameOf(r.category_id) ?? "—"}
              {r.day_of_month ? ` · le ${r.day_of_month}` : ""}
            </div>
          </div>
          <strong className="font-mono-num text-sm">
            {eur(monthlyAmount(r))}
            <span className="text-ink-muted text-[11px]"> /mois</span>
          </strong>
        </div>
      ))}
      {!!active.length && (
        <div className="flex justify-between items-center py-3 mt-1">
          <span className="text-sm font-medium">Total mensuel</span>
          <strong className="font-mono-num text-sm">{eur(total)}</strong>
        </div>
      )}
    </section>
  );
}
