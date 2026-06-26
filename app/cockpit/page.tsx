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
import { savingsMood } from "@/lib/cockpit/mood";
import { buildNotes } from "@/lib/cockpit/cockpit-notes";
import { categoryIcon } from "@/lib/cockpit/category-icon";
import { Wallet, TrendingUp, PiggyBank, ArrowLeftRight, type LucideIcon } from "lucide-react";
import { currentMonth } from "@/lib/cockpit/format";
import { supabase } from "@/lib/cockpit/supabase";
import { updateTransaction } from "@/lib/cockpit/transactions-api";
import type { Txn, TxnType } from "@/lib/cockpit/types";
import { MonthSwitcher } from "@/components/cockpit/MonthSwitcher";
import { HeroCard } from "@/components/cockpit/HeroCard";
import { StatStrip } from "@/components/cockpit/StatStrip";
import { InsightsRow } from "@/components/cockpit/InsightsRow";
import { CategoryBreakdown } from "@/components/cockpit/CategoryBreakdown";
import { FixedVariableBar } from "@/components/cockpit/FixedVariableBar";
import { FixedChargesList } from "@/components/cockpit/FixedChargesList";
import { TransferTriage } from "@/components/cockpit/TransferTriage";
import { TransferNudge } from "@/components/cockpit/TransferNudge";
import { OpsDrill } from "@/components/cockpit/OpsDrill";
import { ThemeToggle } from "@/components/cockpit/ThemeToggle";
import { Fab } from "@/components/cockpit/Fab";
import { TxnModal } from "@/components/cockpit/TxnModal";

const GOAL = 0.2;
const monthLabelOf = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

const ALL_META: Record<TxnType, { title: string; Icon: LucideIcon }> = {
  income: { title: "Revenus", Icon: TrendingUp },
  expense: { title: "Dépenses", Icon: Wallet },
  savings: { title: "Épargne", Icon: PiggyBank },
  transfer: { title: "Virements", Icon: ArrowLeftRight },
};

type Drill =
  | null
  | { kind: "category"; id: string }
  | { kind: "all"; type: TxnType };

export default function DashboardPage() {
  const user = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const [showAdd, setShowAdd] = useState(false);
  const [editTxn, setEditTxn] = useState<Txn | null>(null);
  const [drill, setDrill] = useState<Drill>(null);
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<string | null>(null);
  const [showFixed, setShowFixed] = useState(false);
  const [showTransfers, setShowTransfers] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [classifying, setClassifying] = useState(false);

  const { txns, refetch } = useTransactions(month);
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
  const mood = useMemo(
    () => savingsMood(metrics.tauxEpargne, GOAL),
    [metrics.tauxEpargne]
  );
  const notes = useMemo(() => buildNotes(insights, mood), [insights, mood]);
  const label = monthLabelOf(month);

  const drillCat =
    drill?.kind === "category"
      ? categories.find((c) => c.id === drill.id)
      : null;
  const drillTxns =
    drill?.kind === "category"
      ? txns.filter((t) => t.category_id === drill.id)
      : drill?.kind === "all"
        ? txns.filter((t) => t.type === drill.type)
        : [];

  const changeMonth = (m: string) => {
    setMonth(m);
    setDrill(null);
    setQuery("");
    setChip(null);
    setShowFixed(false);
    setShowTransfers(false);
  };
  const openCategory = (id: string) => {
    setDrill({ kind: "category", id });
    setQuery("");
  };
  const openAllOps = (type: TxnType) => {
    setDrill({ kind: "all", type });
    setQuery("");
    setChip(null);
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

      <HeroCard
        taux={metrics.tauxEpargne}
        reste={metrics.resteAVivre}
        monthLabel={label}
        mood={mood}
        goal={GOAL}
      />
      <StatStrip metrics={metrics} onDrill={openAllOps} />

      {showTransfers ? (
        <>
          {transferError && (
            <p className="text-accent text-sm mb-2">{transferError}</p>
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
      ) : drill ? (
        <OpsDrill
          mode={drill.kind === "all" ? "all" : "category"}
          title={drill.kind === "all" ? ALL_META[drill.type].title : drillCat?.name ?? ""}
          Icon={drill.kind === "all" ? ALL_META[drill.type].Icon : categoryIcon(drillCat?.name ?? "")}
          txns={drillTxns}
          categories={categories}
          query={query}
          onQuery={setQuery}
          chip={chip}
          onChip={setChip}
          onSelectTxn={setEditTxn}
          onBack={() => setDrill(null)}
        />
      ) : (
        <>
          {transferError && (
            <p className="text-accent text-sm mb-2">{transferError}</p>
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
          <InsightsRow notes={notes} />
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
          <CategoryBreakdown insights={insights} onSelect={openCategory} />
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
