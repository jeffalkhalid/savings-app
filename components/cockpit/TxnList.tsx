import type { Txn, Category } from "@/lib/cockpit/types";
import { TxnRow } from "./TxnRow";

export function TxnList({
  txns,
  categories,
  loading,
  error,
  monthLabel,
  onSelect,
}: {
  txns: Txn[];
  categories: Category[];
  loading: boolean;
  error: string | null;
  monthLabel: string;
  onSelect: (txn: Txn) => void;
}) {
  const nameOf = (id?: string | null) =>
    categories.find((c) => c.id === id)?.name;

  return (
    <section>
      <div className="text-xs uppercase tracking-[0.1em] text-ink-muted mb-2">
        {monthLabel} · {txns.length} transaction{txns.length > 1 ? "s" : ""}
      </div>
      {error && <p className="text-strat-a text-sm py-4">{error}</p>}
      {loading && !txns.length && (
        <p className="text-ink-muted text-sm py-4">Chargement…</p>
      )}
      {!loading && !error && !txns.length && (
        <p className="text-ink-muted text-sm py-4">Aucune transaction ce mois.</p>
      )}
      <div>
        {txns.map((t) => (
          <TxnRow
            key={t.id}
            txn={t}
            categoryName={nameOf(t.category_id)}
            onSelect={() => onSelect(t)}
          />
        ))}
      </div>
    </section>
  );
}
