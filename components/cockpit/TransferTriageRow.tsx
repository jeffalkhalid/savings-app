import { eur } from "@/lib/cockpit/format";
import type { Txn, Category } from "@/lib/cockpit/types";

export function TransferTriageRow({
  txn,
  categories,
  onReclassify,
}: {
  txn: Txn;
  categories: Category[];
  onReclassify: (txn: Txn, categoryId: string) => void;
}) {
  const neg = Number(txn.amount) < 0;
  return (
    <div className="py-2.5 border-b border-rule">
      <div className="flex justify-between items-center gap-2">
        <div className="min-w-0">
          <div className="text-sm truncate">{txn.description}</div>
          <div className="text-[11px] text-ink-muted mt-0.5">{txn.date}</div>
        </div>
        <strong
          className={`font-mono-num text-sm shrink-0 ${
            neg ? "text-strat-a" : "text-emerald"
          }`}
        >
          {eur(Number(txn.amount))}
        </strong>
      </div>
      <select
        className="border border-rule rounded-lg px-2 py-1.5 text-[13px] bg-card text-ink w-full mt-1.5"
        value={txn.category_id ?? ""}
        onChange={(e) => onReclassify(txn, e.target.value)}
      >
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.type})
          </option>
        ))}
      </select>
    </div>
  );
}
