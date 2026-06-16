"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  useAuth,
  useTransactions,
  useCategories,
  useAccounts,
  useMonthlyByCategory,
} from "@/lib/cockpit/hooks";
import { computeMetrics } from "@/lib/cockpit/metrics";
import { analyzeCategories } from "@/lib/cockpit/categories-analysis";
import { currentMonth } from "@/lib/cockpit/format";
import { supabase } from "@/lib/cockpit/supabase";
import type { Txn } from "@/lib/cockpit/types";
import { MonthSwitcher } from "@/components/cockpit/MonthSwitcher";
import { HeroBand } from "@/components/cockpit/HeroBand";
import { StatStrip } from "@/components/cockpit/StatStrip";
import { TxnList } from "@/components/cockpit/TxnList";
import { CategoryBreakdown } from "@/components/cockpit/CategoryBreakdown";
import { Fab } from "@/components/cockpit/Fab";
import { TxnModal } from "@/components/cockpit/TxnModal";

const monthLabelOf = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

export default function DashboardPage() {
  const user = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const [showAdd, setShowAdd] = useState(false);
  const [editTxn, setEditTxn] = useState<Txn | null>(null);
  const [drillCategory, setDrillCategory] = useState<string | null>(null);

  const { txns, loading, error, refetch } = useTransactions(month);
  const { categories } = useCategories();
  const { accounts } = useAccounts();
  const { rows: monthlyByCat } = useMonthlyByCategory(user.id);

  const metrics = useMemo(() => computeMetrics(txns), [txns]);
  const insights = useMemo(
    () => analyzeCategories(monthlyByCat, month, categories),
    [monthlyByCat, month, categories]
  );
  const label = monthLabelOf(month);

  const changeMonth = (m: string) => {
    setMonth(m);
    setDrillCategory(null);
  };
  const drillTxns = drillCategory
    ? txns.filter((t) => t.category_id === drillCategory)
    : [];
  const drillName =
    categories.find((c) => c.id === drillCategory)?.name ?? "";

  return (
    <main className="max-w-[600px] mx-auto px-5 pt-8">
      <header className="flex justify-between items-center mb-6">
        <h1 className="font-display text-2xl">Cockpit</h1>
        <div className="flex items-center gap-2">
          <MonthSwitcher month={month} onChange={changeMonth} />
          <Link href="/cockpit/import" className="text-ink-muted text-sm">
            Import
          </Link>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-ink-muted text-sm"
          >
            Déco
          </button>
        </div>
      </header>

      <HeroBand metrics={metrics} monthLabel={label} />
      <StatStrip metrics={metrics} />

      {drillCategory ? (
        <section>
          <button
            onClick={() => setDrillCategory(null)}
            className="text-ink-muted text-sm mb-2"
          >
            ‹ Retour
          </button>
          <div className="text-xs uppercase tracking-[0.1em] text-ink-muted mb-2">
            {drillName}
          </div>
          <TxnList
            txns={drillTxns}
            categories={categories}
            loading={loading}
            error={error}
            monthLabel={label}
            onSelect={setEditTxn}
          />
        </section>
      ) : (
        <CategoryBreakdown
          insights={insights}
          monthLabel={label}
          onSelect={setDrillCategory}
        />
      )}

      <Fab onClick={() => setShowAdd(true)} label="Ajouter une transaction" />

      {showAdd && (
        <TxnModal
          userId={user.id}
          categories={categories}
          accounts={accounts}
          txn={null}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            refetch();
            setShowAdd(false);
          }}
        />
      )}

      {editTxn && (
        <TxnModal
          userId={user.id}
          categories={categories}
          accounts={accounts}
          txn={editTxn}
          onClose={() => setEditTxn(null)}
          onSaved={() => {
            refetch();
            setEditTxn(null);
          }}
        />
      )}
    </main>
  );
}
