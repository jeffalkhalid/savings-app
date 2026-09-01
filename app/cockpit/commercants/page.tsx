"use client";

import { useMemo, useState } from "react";
import { Store } from "lucide-react";
import Link from "next/link";
import { useAllTransactions, useAuth, useCategories } from "@/lib/cockpit/hooks";
import { aggregateByMerchant, merchantSeries } from "@/lib/cockpit/merchants";
import { merchantKey } from "@/lib/cockpit/payee-key";
import { useBulkRecategorise } from "@/lib/cockpit/use-bulk-recategorise";
import { MerchantList } from "@/components/cockpit/MerchantList";
import { MerchantSeriesBars } from "@/components/cockpit/MerchantSeriesBars";
import { CategoryPickerSheet } from "@/components/cockpit/CategoryPickerSheet";
import { OpsDrill } from "@/components/cockpit/OpsDrill";
import { eur } from "@/lib/cockpit/format";
import type { TxnType } from "@/lib/cockpit/types";

const TYPES: { v: TxnType | "all"; label: string }[] = [
  { v: "all", label: "Tout" },
  { v: "expense", label: "Dépenses" },
  { v: "transfer", label: "Virements" },
  { v: "savings", label: "Épargne" },
  { v: "income", label: "Revenus" },
];

export default function CommercantsPage() {
  const user = useAuth();
  const { txns, loading, refetch } = useAllTransactions();
  const { categories } = useCategories();
  const [type, setType] = useState<TxnType | "all">("all");
  const [query, setQuery] = useState("");
  const [drillQuery, setDrillQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const scoped = useMemo(
    () => (type === "all" ? txns : txns.filter((t) => t.type === type)),
    [txns, type]
  );
  const merchants = useMemo(() => aggregateByMerchant(scoped), [scoped]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? merchants.filter((m) => m.label.toLowerCase().includes(q))
      : merchants;
  }, [merchants, query]);
  const total = useMemo(
    () => shown.reduce((a, m) => a + m.total, 0),
    [shown]
  );

  const selected = merchants.find((m) => m.key === selectedKey) ?? null;
  const selectedTxns = useMemo(
    () =>
      selectedKey
        ? scoped.filter((t) => merchantKey(t.description) === selectedKey)
        : [],
    [scoped, selectedKey]
  );
  const series = useMemo(
    () => (selectedKey ? merchantSeries(scoped, selectedKey) : []),
    [scoped, selectedKey]
  );

  // Recharger après un reclassement : sans cela la liste garde les anciennes
  // catégories et les totaux ne bougent pas.
  const bulk = useBulkRecategorise(user.id, refetch);

  const chipCls = (active: boolean) =>
    `shrink-0 rounded-full px-3 py-1.5 text-[12px] ${
      active ? "bg-accent text-[#FBF3EC]" : "bg-seg text-ink-muted"
    }`;

  // Ouvrir/fermer la fiche remet la recherche interne à zéro : sans ça, une
  // recherche laissée dans la fiche d'un commerçant fuit vers le suivant, et
  // son total affiché ne correspond plus à celui du classement.
  const openMerchant = (key: string) => {
    setSelectedKey(key);
    setDrillQuery("");
  };
  const closeMerchant = () => {
    setSelectedKey(null);
    setDrillQuery("");
  };

  return (
    <main className="max-w-[600px] mx-auto px-5 pt-8 pb-24">
      {selected ? (
        <>
          <MerchantSeriesBars series={series} />
          <OpsDrill
            mode="category"
            title={selected.label}
            Icon={Store}
            txns={selectedTxns}
            categories={categories.filter((c) => c.active !== false)}
            query={drillQuery}
            onQuery={setDrillQuery}
            chip={null}
            onChip={() => {}}
            onSelectTxn={() => {}}
            onBack={closeMerchant}
            onBulkCategorise={bulk.start}
          />
        </>
      ) : (
        <>
          <header className="mb-4">
            <Link href="/cockpit" className="text-ink-muted text-sm">
              ‹ Cockpit
            </Link>
            <h1 className="font-display text-2xl mt-2">Commerçants</h1>
            <p className="text-[13px] text-ink-muted mt-1">
              {loading
                ? "Chargement…"
                : `${shown.length} commerçant${shown.length > 1 ? "s" : ""} · ${eur(total)}`}
            </p>
          </header>

          <div className="flex gap-2 overflow-x-auto pb-2.5 mb-2">
            {TYPES.map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setType(o.v)}
                className={chipCls(type === o.v)}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-card rounded-xl px-3.5 mb-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un commerçant…"
              className="flex-1 bg-transparent outline-none text-sm py-3 text-ink"
            />
          </div>

          {!loading && <MerchantList merchants={shown} onSelect={openMerchant} />}
        </>
      )}

      {bulk.note && (
        <p
          className={`text-[13px] mt-3 ${
            bulk.noteIsError ? "text-accent" : "text-emerald"
          }`}
        >
          {bulk.note}
        </p>
      )}

      {bulk.pending && (
        <CategoryPickerSheet
          categories={categories.filter((c) => c.active !== false)}
          title={`Reclasser ${bulk.pending.length} opération${
            bulk.pending.length > 1 ? "s" : ""
          }`}
          onPick={(name) => bulk.apply(name, categories)}
          onClose={bulk.cancel}
        />
      )}
    </main>
  );
}
