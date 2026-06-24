import type { Txn, Category } from "@/lib/cockpit/types";
import { TransferTriageRow } from "./TransferTriageRow";

export function TransferTriage({
  transfers,
  categories,
  onReclassify,
  onBack,
}: {
  transfers: Txn[];
  categories: Category[];
  onReclassify: (txn: Txn, categoryId: string) => void;
  onBack: () => void;
}) {
  return (
    <section>
      <button onClick={onBack} className="text-ink-muted text-sm mb-2">
        ‹ Retour
      </button>
      <div className="text-xs uppercase tracking-[0.1em] text-ink-muted mb-2">
        Virements à classer · {transfers.length}
      </div>
      {!transfers.length && (
        <p className="text-ink-muted text-sm py-4">
          Tous les virements sont classés.
        </p>
      )}
      {transfers.map((t) => (
        <TransferTriageRow
          key={t.id}
          txn={t}
          categories={categories}
          onReclassify={onReclassify}
        />
      ))}
    </section>
  );
}
