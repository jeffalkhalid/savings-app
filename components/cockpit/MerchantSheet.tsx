"use client";

import { Store } from "lucide-react";
import { MerchantSeriesBars } from "@/components/cockpit/MerchantSeriesBars";
import { OpsDrill } from "@/components/cockpit/OpsDrill";
import type { Category, Txn } from "@/lib/cockpit/types";

/**
 * Fiche d'un commerçant : son évolution mensuelle et ses opérations.
 *
 * Partagée par l'écran Commerçants et l'écran Dérive. La dupliquer
 * garantirait que les deux copies divergent — c'est déjà arrivé une fois sur
 * le reclassement en masse, d'où `useBulkRecategorise`.
 */
export function MerchantSheet({
  label,
  lastDate,
  series,
  txns,
  categories,
  query,
  onQuery,
  onBack,
  onBulkCategorise,
  onBulkDelete,
}: {
  label: string;
  lastDate?: string;
  series: { month: string; total: number }[];
  txns: Txn[];
  categories: Category[];
  query: string;
  onQuery: (q: string) => void;
  onBack: () => void;
  onBulkCategorise?: (txns: Txn[]) => void;
  onBulkDelete?: (txns: Txn[]) => void;
}) {
  return (
    <>
      {lastDate && (
        <p className="text-[13px] text-ink-muted mb-2">
          Dernière opération le{" "}
          {new Date(`${lastDate}T00:00:00`).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      )}
      <MerchantSeriesBars series={series} />
      <OpsDrill
        mode="category"
        title={label}
        Icon={Store}
        txns={txns}
        categories={categories}
        query={query}
        onQuery={onQuery}
        chip={null}
        onChip={() => {}}
        onSelectTxn={() => {}}
        onBack={onBack}
        onBulkCategorise={onBulkCategorise}
        onBulkDelete={onBulkDelete}
      />
    </>
  );
}
