import type { Txn } from "./types";
import { budgetMonthOf, type SalaryShift } from "./budget-month";

export type MonthTotals = {
  month: string; // "YYYY-MM"
  revenus: number;
  depenses: number;
  epargne: number;
  /** 0..1 ; 0 quand les revenus sont nuls, comme computeMetrics. */
  tauxEpargne: number;
};

const abs = (t: Txn): number => Math.abs(Number(t.amount));

/**
 * Séries mensuelles des grands agrégats, découpées par **mois budgétaire**.
 *
 * Le découpage passe par `budgetMonthOf` et les définitions reprennent
 * `computeMetrics`, pour que la courbe passe exactement par le chiffre que le
 * Cockpit affiche pour le même mois. Deux écrans qui se contredisent sur le
 * même chiffre valent moins que pas de courbe.
 *
 * Les `transfer` sont exclus : ce sont des mouvements entre comptes, les
 * compter gonflerait artificiellement les séries.
 */
export function monthlyTotals(txns: Txn[], shift: SalaryShift): MonthTotals[] {
  const byMonth = new Map<
    string,
    { revenus: number; depenses: number; epargne: number }
  >();

  for (const t of txns) {
    const month = budgetMonthOf(t, shift);
    const acc =
      byMonth.get(month) ?? { revenus: 0, depenses: 0, epargne: 0 };
    if (t.type === "income") acc.revenus += abs(t);
    else if (t.type === "expense") acc.depenses += abs(t);
    else if (t.type === "savings") acc.epargne += abs(t);
    byMonth.set(month, acc);
  }

  return [...byMonth.entries()]
    .map(([month, a]) => ({
      month,
      revenus: a.revenus,
      depenses: a.depenses,
      epargne: a.epargne,
      tauxEpargne: a.revenus > 0 ? a.epargne / a.revenus : 0,
    }))
    .sort((x, y) => (x.month < y.month ? -1 : x.month > y.month ? 1 : 0));
}

/**
 * Dépenses mensuelles pour un ensemble de catégories.
 *
 * Un mois entièrement vide est absent de la série ; mais dans un mois qui
 * existe, une catégorie sans dépense vaut **0**, sinon sa courbe se briserait
 * en segments — et une interruption de tracé se lit comme une absence de
 * donnée, pas comme une absence de dépense.
 */
export function monthlyByCategory(
  txns: Txn[],
  shift: SalaryShift,
  categoryIds: string[]
): { month: string; totals: Record<string, number> }[] {
  if (!categoryIds.length) return [];
  const wanted = new Set(categoryIds);
  const byMonth = new Map<string, Record<string, number>>();

  for (const t of txns) {
    if (t.type !== "expense") continue;
    if (!t.category_id || !wanted.has(t.category_id)) continue;
    const month = budgetMonthOf(t, shift);
    let totals = byMonth.get(month);
    if (!totals) {
      totals = {};
      for (const id of categoryIds) totals[id] = 0;
      byMonth.set(month, totals);
    }
    totals[t.category_id] += abs(t);
  }

  return [...byMonth.entries()]
    .map(([month, totals]) => ({ month, totals }))
    .sort((x, y) => (x.month < y.month ? -1 : x.month > y.month ? 1 : 0));
}

/** Les `n` catégories de dépense les plus lourdes sur toute la période. */
export function topCategories(txns: Txn[], n: number): string[] {
  const totals = new Map<string, number>();
  for (const t of txns) {
    if (t.type !== "expense" || !t.category_id) continue;
    totals.set(t.category_id, (totals.get(t.category_id) ?? 0) + abs(t));
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => id);
}

/**
 * Retire le mois en cours d'une série mensuelle.
 *
 * Un mois non terminé produit un dernier point effondré — dépenses partielles,
 * taux d'épargne décroché — que l'œil lit comme une chute réelle avant de lire
 * la légende. Le suivi du mois courant relève d'un autre écran, pas d'une
 * courbe d'historique.
 *
 * Les mois POSTÉRIEURS sont conservés : une opération peut être datée dans le
 * futur (virement programmé), et il n'y a pas de raison de la masquer.
 */
export function withoutCurrentMonth<T extends { month: string }>(
  series: T[],
  currentMonth: string
): T[] {
  return series.filter((p) => p.month !== currentMonth);
}
