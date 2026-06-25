"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  useAuth,
  useTransactions,
  useCategories,
  useAccounts,
  useMonthlyByCategory,
  useRecurring,
} from "@/lib/cockpit/hooks";
import { computeMetrics } from "@/lib/cockpit/metrics";
import { analyzeCategories } from "@/lib/cockpit/categories-analysis";
import { monthlyFixedTotal, fixedVariableSplit } from "@/lib/cockpit/fixed";
import { pendingTransfers } from "@/lib/cockpit/transfers";
import {
  ensureTransferCategories,
  classifyAllTransfers,
} from "@/lib/cockpit/transfers-api";
import { currentMonth } from "@/lib/cockpit/format";
import { supabase } from "@/lib/cockpit/supabase";
import { updateTransaction } from "@/lib/cockpit/transactions-api";
import type { Txn } from "@/lib/cockpit/types";
import { MonthSwitcher } from "@/components/cockpit/MonthSwitcher";
import { HeroBand } from "@/components/cockpit/HeroBand";
import { StatStrip } from "@/components/cockpit/StatStrip";
import { TxnList } from "@/components/cockpit/TxnList";
import { CategoryBreakdown } from "@/components/cockpit/CategoryBreakdown";
import { FixedVariableBar } from "@/components/cockpit/FixedVariableBar";
import { FixedChargesList } from "@/components/cockpit/FixedChargesList";
import { TransferTriage } from "@/components/cockpit/TransferTriage";
import { TransferNudge } from "@/components/cockpit/TransferNudge";
import { Fab } from "@/components/cockpit/Fab";
import { TxnModal } from "@/components/cockpit/TxnModal";
import { ThemeToggle } from "@/components/cockpit/ThemeToggle";

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
  const [showFixed, setShowFixed] = useState(false);
  const [showTransfers, setShowTransfers] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [classifying, setClassifying] = useState(false);

  const { txns, loading, error, refetch } = useTransactions(month);
  const { categories } = useCategories();
  const { accounts } = useAccounts();
  const { rows: monthlyByCat, error: catError } = useMonthlyByCategory(user.id);
  const { recurring } = useRecurring(user.id);

  const metrics = useMemo(() => computeMetrics(txns), [txns]);
  const insights = useMemo(
    () => analyzeCategories(monthlyByCat, month, categories),
    [monthlyByCat, month, categories]
  );
  const fixedTotal = useMemo(() => monthlyFixedTotal(recurring), [recurring]);
  const split = useMemo(
    () => fixedVariableSplit(metrics.depenses, fixedTotal),
    [metrics.depenses, fixedTotal]
  );
  const transfers = useMemo(() => pendingTransfers(txns), [txns]);
  const label = monthLabelOf(month);

  const changeMonth = (m: string) => {
    setMonth(m);
    setDrillCategory(null);
    setShowFixed(false);
    setShowTransfers(false);
  };
  const reclassify = async (txn: Txn, categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return;
    setTransferError(null);
    try {
      await updateTransaction(txn.id, {
        date: txn.date,
        absAmount: Math.abs(Number(txn.amount)),
        description: txn.description,
        categoryId,
        categoryName: cat.name,
        accountId: txn.account_id ?? "",
        categoryType: cat.type,
      });
      refetch();
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : "Erreur");
    }
  };
  const autoClassify = async () => {
    setClassifying(true);
    setTransferError(null);
    try {
      const cats = await ensureTransferCategories(user.id, categories);
      await classifyAllTransfers(txns, cats);
      refetch();
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : "Erreur");
    }
    setClassifying(false);
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
          <ThemeToggle />
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

      {showTransfers ? (
        <>
          {transferError && (
            <p className="text-strat-a text-sm mb-2">{transferError}</p>
          )}
          <TransferTriage
            transfers={transfers}
            categories={categories}
            onReclassify={reclassify}
            onBack={() => setShowTransfers(false)}
          />
        </>
      ) : showFixed ? (
        <FixedChargesList
          recurring={recurring}
          categories={categories}
          onBack={() => setShowFixed(false)}
        />
      ) : drillCategory ? (
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
        <>
          {transferError && (
            <p className="text-strat-a text-sm mb-2">{transferError}</p>
          )}
          <TransferNudge
            count={transfers.length}
            onAuto={autoClassify}
            onManual={() => {
              setTransferError(null);
              setShowTransfers(true);
            }}
            busy={classifying}
          />
          {fixedTotal > 0 && (
            <FixedVariableBar
              fixe={split.fixe}
              variable={split.variable}
              fixedShare={split.fixedShare}
              onDrill={() => setShowFixed(true)}
            />
          )}
          {catError && (
            <p className="text-ink-muted text-xs mb-2">
              Répartition indisponible — réessaie plus tard.
            </p>
          )}
          <CategoryBreakdown
            insights={insights}
            monthLabel={label}
            onSelect={setDrillCategory}
          />
        </>
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
