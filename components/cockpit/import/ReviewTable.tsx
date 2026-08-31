import { useState } from "react";
import type { Category, Account } from "@/lib/cockpit/types";
import type { ClassifiedRow } from "@/lib/cockpit/classify";
import { ReviewRow } from "./ReviewRow";
import { BulkBar } from "./BulkBar";
import { isEngagement } from "@/lib/cockpit/recurring-detect";

type Row = ClassifiedRow & {
  duplicate: boolean;
  include: boolean;
  engagement?: boolean;
};

export function ReviewTable({
  rows,
  categories,
  accounts,
  accountId,
  onAccount,
  onToggleInclude,
  onImport,
  importing,
  engagementKeys,
  onToggleEngagement,
  guessOnly,
  onGuessOnly,
  selected,
  onToggleSelected,
  onSelectAllVisible,
  onClearSelection,
  onOpenPicker,
  onBulkPick,
}: {
  rows: Row[];
  categories: Category[];
  accounts: Account[];
  accountId: string;
  onAccount: (id: string) => void;
  onToggleInclude: (index: number, v: boolean) => void;
  onImport: () => void;
  importing: boolean;
  engagementKeys: Set<string>;
  onToggleEngagement: (index: number, v: boolean) => void;
  guessOnly: boolean;
  onGuessOnly: (v: boolean) => void;
  selected: Set<number>;
  onToggleSelected: (index: number, v: boolean) => void;
  onSelectAllVisible: () => void;
  onClearSelection: () => void;
  onOpenPicker: (index: number) => void;
  onBulkPick: () => void;
}) {
  const toImport = rows.filter((r) => r.include).length;
  const dupes = rows.filter((r) => r.duplicate).length;
  const [shown, setShown] = useState(100);
  const visible = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => (guessOnly ? r.provenance === "guess" : true));
  const slice = visible.slice(0, shown);
  const guesses = rows.filter((r) => r.provenance === "guess").length;
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
      <div className="flex items-center gap-3 mb-3 text-[13px]">
        <label className="flex items-center gap-1.5 text-ink-muted">
          <input
            type="checkbox"
            checked={guessOnly}
            onChange={(e) => onGuessOnly(e.target.checked)}
          />
          Devinettes seulement ({guesses})
        </label>
        <button
          type="button"
          onClick={onSelectAllVisible}
          className="ml-auto text-ink underline"
        >
          Tout sélectionner ({visible.length})
        </button>
      </div>
      <div className="mb-5">
        {slice.map(({ r, i }) => (
          <ReviewRow
            key={`${r.date}-${i}`}
            row={r}
            categories={categories}
            provenance={r.provenance}
            selected={selected.has(i)}
            onToggleSelected={(v) => onToggleSelected(i, v)}
            onOpenPicker={() => onOpenPicker(i)}
            onToggleInclude={(v) => onToggleInclude(i, v)}
            engagementKnown={
              r.amount < 0 &&
              isEngagement(r.label || r.categoryName, engagementKeys)
            }
            engagement={!!r.engagement}
            onToggleEngagement={(v) => onToggleEngagement(i, v)}
          />
        ))}
        {slice.length < visible.length && (
          <button
            type="button"
            onClick={() => setShown((n) => n + 100)}
            className="w-full py-3 text-[13px] text-ink-muted border border-rule rounded-lg mt-2"
          >
            Afficher 100 de plus ({visible.length - slice.length} restantes)
          </button>
        )}
      </div>
      <button
        className="bg-emerald text-paper rounded-lg py-3.5 font-semibold w-full disabled:opacity-60"
        onClick={onImport}
        disabled={importing || toImport === 0}
      >
        {importing ? "Import…" : `Importer ${toImport} ligne${toImport > 1 ? "s" : ""}`}
      </button>
      <BulkBar count={selected.size} onPick={onBulkPick} onClear={onClearSelection} />
    </section>
  );
}
