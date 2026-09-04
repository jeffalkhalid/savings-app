"use client";

import { useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  useCategoryBudgets,
} from "@/lib/cockpit/hooks";
import { computeMetrics } from "@/lib/cockpit/metrics";
import { analyzeCategories } from "@/lib/cockpit/categories-analysis";
import { detectRecurring } from "@/lib/cockpit/recurring-detect";
import { matchMonth, engagementsTotals } from "@/lib/cockpit/recurring-match";
import { pendingTransfers } from "@/lib/cockpit/transfers";
import { isShifted } from "@/lib/cockpit/budget-month";
import {
  ensureTransferCategories,
  classifyAllTransfers,
} from "@/lib/cockpit/transfers-api";
import { savingsMood } from "@/lib/cockpit/mood";
import { buildNotes } from "@/lib/cockpit/cockpit-notes";
import { categoryIcon } from "@/lib/cockpit/category-icon";
import { Wallet, TrendingUp, PiggyBank, ArrowLeftRight, Settings, Bell, Home, type LucideIcon } from "lucide-react";
import { currentMonth, todayISO } from "@/lib/cockpit/format";
import { updateTransaction } from "@/lib/cockpit/transactions-api";
import type { Txn, TxnType } from "@/lib/cockpit/types";
import { MonthSwitcher } from "@/components/cockpit/MonthSwitcher";
import { HeroCard } from "@/components/cockpit/HeroCard";
import { StatStrip } from "@/components/cockpit/StatStrip";
import { InsightsRow } from "@/components/cockpit/InsightsRow";
import { CategoryBreakdown } from "@/components/cockpit/CategoryBreakdown";
import { EngagementsBar } from "@/components/cockpit/EngagementsBar";
import { MonthPaceCard } from "@/components/cockpit/MonthPaceCard";
import { monthPace } from "@/lib/cockpit/pace";
import { nonFixedExpenseTotal } from "@/lib/cockpit/fixed";
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
import { CategoryPickerSheet } from "@/components/cockpit/CategoryPickerSheet";
import { ConfirmDeleteSheet } from "@/components/cockpit/ConfirmDeleteSheet";
import { useBulkRecategorise } from "@/lib/cockpit/use-bulk-recategorise";
import { useBulkDelete } from "@/lib/cockpit/use-bulk-delete";


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
  const router = useRouter();
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

  const { settings, refetch: refetchSettings } = useUserSettings(user.id);
  const { txns, loading: txnsLoading, refetch } = useTransactions(month, settings.salary_shift);
  const { categories, refetch: refetchCategories } = useCategories();
  const { budgets, refetch: refetchBudgets } = useCategoryBudgets();
  const { charges, loading: chargesLoading, refetch: refetchCharges } = useRecurringCharges();
  const { txns: allTxns, refetch: refetchAllTxns } = useAllTransactions();
  const { accounts } = useAccounts();
  const { rows: monthlyByCat, error: catError } = useMonthlyByCategory(user.id);
  const { reminders, refetch: refetchReminders } = useReminders();
  const { goals } = useGoals();
  // `detectRecurring(allTxns, month)` alimente le panneau « Détectés » : après
  // une action en masse, l'historique complet doit être rechargé en plus du
  // mois affiché, sinon les candidats restent bâtis sur des lignes supprimées.
  const refetchAfterBulk = useCallback(() => {
    refetch();
    refetchAllTxns();
  }, [refetch, refetchAllTxns]);
  const bulk = useBulkRecategorise(user.id, refetchAfterBulk);
  const del = useBulkDelete(refetchAfterBulk);

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
  // « Est-ce que je tiens » n'a de sens que sur le mois en cours : un budget
  // journalier sur un mois clos serait absurde.
  const isCurrentMonth = month === currentMonth();
  const today = todayISO();
  const fixedCategoryIds = useMemo(
    () =>
      new Set(categories.filter((c) => c.is_fixed).map((c) => c.id)),
    [categories]
  );
  // `totals.variable` et `nonFixedVariable` partitionnent le même ensemble de
  // dépenses (les `txns` du mois budgétaire courant, même source, même
  // fraîcheur) selon deux critères différents — le premier exclut les
  // engagements CONFIRMÉS, le second exclut les catégories marquées fixes,
  // confirmées ou non. Chacun pris seul est un majorant du variable
  // réellement variable ; le plus petit des deux est donc le majorant le
  // plus serré que les données existantes permettent. Sans aucune catégorie
  // marquée fixe, ce minimum dégénère vers `totals.variable` : le
  // comportement actuel, inchangé.
  const nonFixedVariable = useMemo(
    () => nonFixedExpenseTotal(txns, fixedCategoryIds),
    [txns, fixedCategoryIds]
  );
  const pace = useMemo(
    () =>
      monthPace({
        resteAVivre: metrics.resteAVivre,
        pendingEngagements: totals.pending,
        variable: Math.min(totals.variable, nonFixedVariable),
        today,
      }),
    [metrics.resteAVivre, totals.pending, totals.variable, nonFixedVariable, today]
  );
  // Ne masque la carte que sur le CHARGEMENT INITIAL de chacune des deux
  // sources : `loading` repasse à vrai à chaque refetch (confirmer un
  // engagement, ajouter une transaction), et si on masquait sur `loading`
  // seul la carte clignoterait à chaque fois. Une fois qu'on a des données,
  // un refetch en cours ne doit plus la cacher.
  const paceReady =
    (!txnsLoading || txns.length > 0) && (!chargesLoading || charges.length > 0);
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

  const shiftedLabelOf = useCallback(
    (t: Txn) =>
      isShifted(t, settings.salary_shift)
        ? monthLabelOf(month)
        : undefined,
    [settings.salary_shift, month]
  );
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
          {/* Vers le simulateur d'épargne salariale, l'autre moitié de l'app :
              le Cockpit n'y menait par aucun lien. */}
          <Link href="/" aria-label="Simulateur d'épargne salariale" className="text-ink-muted">
            <Home size={18} />
          </Link>
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
          onBulkCategorise={bulk.start}
          onBulkDelete={del.start}
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
          shiftedLabelOf={shiftedLabelOf}
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
          {isCurrentMonth && paceReady && <MonthPaceCard pace={pace} />}
          {catError && (
            <p className="text-ink-muted text-xs mb-2">
              Répartition indisponible — réessaie plus tard.
            </p>
          )}
          <CategoryBreakdown
            insights={insights}
            budgets={budgets}
            onSelect={openCategory}
            onEditBudgets={() => setShowBudgets(true)}
            onOpenMerchants={() => router.push("/cockpit/commercants")}
            onOpenEvolution={() => router.push("/cockpit/evolution")}
            onOpenDrift={() => router.push("/cockpit/derive")}
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
          categories={categories}
          allTxns={allTxns}
          onCategoriesChanged={refetchCategories}
          onSettingsChanged={refetchSettings}
          onWiped={() => {
            // Les deux listes : celle du mois affiché et l'historique complet
            // dont vivent Évolution, Commerçants, Dérive et les détections.
            refetch();
            refetchAllTxns();
            setShowSettings(false);
          }}
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
          userId={user.id}
          budgets={budgets}
          onClose={() => setShowBudgets(false)}
          onSaved={() => {
            refetchBudgets();
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
      {bulk.note && (
        <p
          className={`text-[13px] mb-3 ${
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
      {del.note && <p className="text-[13px] mb-3 text-emerald">{del.note}</p>}
      {del.pending && (
        <ConfirmDeleteSheet
          txns={del.pending}
          busy={del.busy}
          error={del.error}
          onConfirm={del.confirm}
          onClose={del.cancel}
        />
      )}
    </main>
  );
}
