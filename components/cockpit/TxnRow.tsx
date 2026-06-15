import type { Txn } from "@/lib/cockpit/types";
import { eur } from "@/lib/cockpit/format";

export function TxnRow({
  txn,
  categoryName,
}: {
  txn: Txn;
  categoryName?: string;
}) {
  const neg = Number(txn.amount) < 0;
  return (
    <button
      type="button"
      className="w-full flex justify-between items-center py-3 border-b border-rule text-left"
    >
      <div>
        <div className="text-sm">{txn.description}</div>
        <div className="text-[11px] text-ink-muted mt-0.5">
          {txn.date}
          {categoryName ? ` · ${categoryName}` : ""}
        </div>
      </div>
      <strong
        className={`font-mono-num text-sm ${neg ? "text-strat-a" : "text-emerald"}`}
      >
        {eur(Number(txn.amount))}
      </strong>
    </button>
  );
}
