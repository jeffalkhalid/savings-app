import { eur } from "@/lib/cockpit/format";
import { filterTxns } from "@/lib/cockpit/txn-filter";
import type { Txn, Category } from "@/lib/cockpit/types";

export function OpsDrill({
  mode,
  title,
  icon,
  txns,
  categories,
  query,
  onQuery,
  chip,
  onChip,
  onSelectTxn,
  onBack,
}: {
  mode: "category" | "all";
  title: string;
  icon: string;
  txns: Txn[];
  categories: Category[];
  query: string;
  onQuery: (q: string) => void;
  chip: string | null;
  onChip: (id: string | null) => void;
  onSelectTxn: (t: Txn) => void;
  onBack: () => void;
}) {
  const shown = filterTxns(txns, query, mode === "all" ? chip : null);
  const total = shown.reduce((a, t) => a + Math.abs(Number(t.amount)), 0);
  const chipCats = categories.filter((c) =>
    txns.some((t) => t.category_id === c.id)
  );
  const fmtDate = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
    });

  const chipCls = (active: boolean) =>
    `shrink-0 rounded-full px-3 py-1.5 text-[12px] ${
      active ? "bg-accent text-[#FBF3EC]" : "bg-seg text-ink-muted"
    }`;

  return (
    <section className="pt-1">
      <button
        type="button"
        onClick={onBack}
        className="text-ink-muted text-sm mb-3"
      >
        ‹ Retour
      </button>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-tile flex items-center justify-center text-lg">
          {icon}
        </div>
        <div>
          <div className="font-display text-lg">{title}</div>
          <div className="text-xs text-ink-muted">
            {shown.length} opérations · {eur(total)}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-card rounded-xl px-3.5 mb-3">
        <input
          type="text"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Rechercher une opération…"
          className="flex-1 bg-transparent outline-none text-sm py-3 text-ink"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQuery("")}
            className="text-ink-muted text-base"
          >
            ×
          </button>
        )}
      </div>

      {mode === "all" && chipCats.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2.5 mb-1">
          <button type="button" onClick={() => onChip(null)} className={chipCls(chip === null)}>
            Tout
          </button>
          {chipCats.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onChip(c.id)}
              className={chipCls(chip === c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {shown.map((t) => {
        const amt = Number(t.amount);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelectTxn(t)}
            className="w-full text-left flex justify-between items-center gap-2.5 py-2.5 border-b border-rule"
          >
            <div className="min-w-0">
              <div className="text-sm truncate">{t.description}</div>
              <div className="text-[11.5px] text-ink-muted mt-0.5">
                {fmtDate(t.date)}
              </div>
            </div>
            <span
              className={`font-mono-num text-sm shrink-0 ${
                amt < 0 ? "text-accent" : "text-emerald"
              }`}
            >
              {eur(amt)}
            </span>
          </button>
        );
      })}

      {!shown.length && (
        <div className="text-center py-8 text-ink-muted">
          <div className="text-3xl mb-1.5">🔍</div>
          <div className="text-sm font-semibold text-ink">Aucune opération</div>
          <div className="text-xs mt-0.5">
            Essaie un autre mot{mode === "all" ? " ou une autre catégorie" : ""}.
          </div>
        </div>
      )}
    </section>
  );
}
