import type { Category, Account } from "@/lib/cockpit/types";
import type { ReviewRow as ReviewRowData } from "@/lib/cockpit/bnp-import";
import { ReviewRow } from "./ReviewRow";

type Row = ReviewRowData & { include: boolean };

export function ReviewTable({
  rows,
  categories,
  accounts,
  accountId,
  onAccount,
  onCategory,
  onToggleInclude,
  onImport,
  importing,
}: {
  rows: Row[];
  categories: Category[];
  accounts: Account[];
  accountId: string;
  onAccount: (id: string) => void;
  onCategory: (index: number, name: string) => void;
  onToggleInclude: (index: number, v: boolean) => void;
  onImport: () => void;
  importing: boolean;
}) {
  const toImport = rows.filter((r) => r.include).length;
  const dupes = rows.filter((r) => r.duplicate).length;
  return (
    <section>
      <div className="text-xs uppercase tracking-[0.1em] text-ink-muted mb-2">
        {toImport} à importer · {dupes} doublon{dupes > 1 ? "s" : ""}
      </div>
      <label className="grid gap-1.5 text-[13px] text-ink-muted mb-4">
        Compte cible
        <select
          className="border border-rule rounded-lg px-3 py-3 bg-card text-ink text-base w-full"
          value={accountId}
          onChange={(e) => onAccount(e.target.value)}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <div className="mb-5">
        {rows.map((r, i) => (
          <ReviewRow
            key={`${r.date}-${i}`}
            row={r}
            categories={categories}
            onCategory={(name) => onCategory(i, name)}
            onToggleInclude={(v) => onToggleInclude(i, v)}
          />
        ))}
      </div>
      <button
        className="bg-emerald text-paper rounded-lg py-3.5 font-semibold w-full disabled:opacity-60"
        onClick={onImport}
        disabled={importing || toImport === 0}
      >
        {importing ? "Import…" : `Importer ${toImport} ligne${toImport > 1 ? "s" : ""}`}
      </button>
    </section>
  );
}
