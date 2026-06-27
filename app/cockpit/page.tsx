"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  useAuth,
  useTransactions,
  useCategories,
  useAccounts,
  useMonthlyByCategory,
  useUserSettings,
  useReminders,
  useGoals,
  useAllTransactions,
  useRecurringCharges,
} from "@/lib/cockpit/hooks";
import { computeMetrics } from "@/lib/cockpit/metrics";
import { analyzeCategories } from "@/lib/cockpit/categories-analysis";
import { detectRecurring } from "@/lib/cockpit/recurring-detect";
import { matchMonth, engagementsTotals } from "@/lib/cockpit/recurring-match";
import { pendingTransfers } from "@/lib/cockpit/transfers";
import {
  ensureTransferCategories,
  classifyAllTransfers,
} from "@/lib/cockpit/transfers-api";
import { savingsMood } from "@/lib/cockpit/mood";
import { buildNotes } from "@/lib/cockpit/cockpit-notes";
import { categoryIcon } from "@/lib/cockpit/category-icon";
import { Wallet, TrendingUp, PiggyBank, ArrowLeftRight, Settings, Bell, type LucideIcon } from "lucide-react";
import { currentMonth, todayISO } from "@/lib/cockpit/format";
import { updateTransaction } from "@/lib/cockpit/transactions-api";
import type { Txn, TxnType } from "@/lib/cockpit/types";
import { MonthSwitcher } from "@/components/cockpit/MonthSwitcher";
import { HeroCard } from "@/components/cockpit/HeroCard";
import { StatStrip } from "@/components/cockpit/StatStrip";
import { InsightsRow } from "@/components/cockpit/InsightsRow";
import { CategoryBreakdown } from "@/components/cockpit/CategoryBreakdown";
import { EngagementsBar } from "@/components/cockpit/EngagementsBar";
import { EngagementsModal } from "@/components/cockpit/EngagementsModal";
import { TransferTriage } from "@/components/cockpit/TransferTriage";
import { TransferNudge } from "@/components/cockpit/TransferNudge";
import { OpsDrill } from "@/components/cockpit/OpsDrill";
import { Fab } from "@/components/cockpit/Fab";
import { TxnModal } from "@/components/cockpit/TxnModal";
import { ReglagesModal } from "@/components/cockpit/ReglagesModal";
import { dueCount, type Reminder } from "@/lib/cockpit/reminders";
import { setReminderDone } from "@/lib/cockpit/reminders-api";
import { RemindersModal } from "@/components/cockpit/RemindersModal";
import { ReminderModal } from "@/components/cockpit/ReminderModal";
import { BudgetsModal } from "@/components/cockpit/BudgetsModal";


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
  const [showSettings, setShowSettings] = useState(false);
  const [showReminders, setShowReminders] = useState(false);
  const [showBudgets, setShowBudgets] = useState(false);
  const [reminderForm, setReminderForm] = useState<Reminder | "new" | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [classifying, setClassifying] = useState(false);

  const { txns, refetch } = useTransactions(month);
  const { categories, refetch: refetchCategories } = useCategories();
  const { charges, refetch: refetchCharges } = useRecurringCharges();
  const { txns: allTxns } = useAllTransactions();
  const { accounts } = useAccounts();
  const { rows: monthlyByCat, error: catError } = useMonthlyByCategory(user.id);
  const { settings, refetch: refetchSettings } = useUserSettings(user.id);
  const { reminders, refetch: refetchReminders } = useReminders();
  const { goals } = useGoals();

  const engagementKeys = useMemo(
    () => new Set(charges.map((c) => c.payee_key)),
    [charges]
  );
  const metrics = useMemo(() => computeMetrics(txns), [txns]);
  const insights = useMemo(
    () => analyzeCategories(monthlyByCat, month, categories),
    [monthlyByCat, month, categories]
  );
  const monthExpenseTxns = useMemo(
    () => txns.filter((t) => t.type === "expense"),
    [txns]
  );
  const matches = useMemo(
    () =>
      matchMonth(
        charges.map((c) => ({
          payeeKey: c.payee_key,
          expected: Number(c.expected_amount),
        })),
        monthExpenseTxns
      ),
    [charges, monthExpenseTxns]
  );
  const totals = useMemo(
    () => engagementsTotals(matches, metrics.depenses),
    [matches, metrics.depenses]
  );
  const candidates = useMemo(() => {
    const confirmed = new Set(charges.map((c) => c.payee_key));
    return detectRecurring(allTxns, month).filter(
      (c) => !confirmed.has(c.payeeKey)
    );
  }, [allTxns, month, charges]);
  const transfers = useMemo(() => pendingTransfers(txns), [txns]);
  const goal = settings.savings_rate_goal;
  const mood = useMemo(
    () => savingsMood(metrics.tauxEpargne, goal),
    [metrics.tauxEpargne, goal]
  );
  const notes = useMemo(() => buildNotes(insights, mood), [insights, mood]);
  const label = monthLabelOf(month);
  const today = todayISO();
  const reminderDue = dueCount(reminders, today);

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
          <MonthSwitcher month={month} onChange={changeMonth} />
          <Link href="/cockpit/import" className="text-ink-muted text-sm">
            Import
          </Link>
          <button
            onClick={() => setShowReminders(true)}
            aria-label="Rappels"
            className="relative text-ink-muted"
            type="button"
          >
            <Bell size={18} />
            {reminderDue > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-accent text-[#FBF3EC] text-[10px] font-bold flex items-center justify-center">
                {reminderDue}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowSettings(true)}
            aria-label="Réglages"
            className="text-ink-muted"
            type="button"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      <HeroCard
        taux={metrics.tauxEpargne}
        reste={metrics.resteAVivre}
        monthLabel={label}
        mood={mood}
        goal={goal}
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
          {(metrics.depenses > 0 || charges.length > 0) && (
            <EngagementsBar
              paid={totals.paid}
              pending={totals.pending}
              variable={totals.variable}
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
            categories={categories}
            onSelect={openCategory}
            onEditBudgets={() => setShowBudgets(true)}
          />
        </>
      )}

      <Fab onClick={() => setShowAdd(true)} label="Ajouter une transaction" />

      {showAdd && (
        <TxnModal
          userId={user.id}
          categories={categories}
          accounts={accounts}
          goals={goals}
          txn={null}
          engagementKeys={engagementKeys}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            refetch();
            refetchCharges();
            setShowAdd(false);
          }}
        />
      )}

      {editTxn && (
        <TxnModal
          userId={user.id}
          categories={categories}
          accounts={accounts}
          goals={goals}
          txn={editTxn}
          engagementKeys={engagementKeys}
          onClose={() => setEditTxn(null)}
          onSaved={() => {
            refetch();
            refetchCharges();
            setEditTxn(null);
          }}
        />
      )}

      {showSettings && (
        <ReglagesModal
          userId={user.id}
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSaved={() => {
            refetchSettings();
            setShowSettings(false);
          }}
        />
      )}

      {showReminders && (
        <RemindersModal
          reminders={reminders}
          today={today}
          onAdd={() => setReminderForm("new")}
          onEdit={(r) => setReminderForm(r)}
          onToggleDone={async (r) => {
            await setReminderDone(r.id, !r.done);
            refetchReminders();
          }}
          onClose={() => setShowReminders(false)}
        />
      )}
      {reminderForm && (
        <ReminderModal
          userId={user.id}
          reminder={reminderForm === "new" ? null : reminderForm}
          onClose={() => setReminderForm(null)}
          onSaved={() => {
            refetchReminders();
            setReminderForm(null);
          }}
        />
      )}
      {showBudgets && (
        <BudgetsModal
          categories={categories}
          onClose={() => setShowBudgets(false)}
          onSaved={() => {
            refetchCategories();
            setShowBudgets(false);
          }}
        />
      )}
      {showFixed && (
        <EngagementsModal
          userId={user.id}
          charges={charges}
          matches={matches}
          candidates={candidates}
          onClose={() => setShowFixed(false)}
          onChanged={refetchCharges}
        />
      )}
    </main>
  );
}
