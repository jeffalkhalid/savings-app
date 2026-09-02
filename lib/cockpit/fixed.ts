import type { Txn } from "./types";

/**
 * Dépenses du mois hors catégories fixes, calculées directement sur les
 * transactions — pas sur la vue `v_monthly_by_category` : même source que
 * les autres totaux du Cockpit, donc même fraîcheur et même partition du
 * mois budgétaire.
 *
 * Une transaction sans `category_id` compte comme non fixe : ça surestime le
 * variable plutôt que de le sous-estimer, le sens sûr pour un rythme de
 * dépense.
 */
export function nonFixedExpenseTotal(txns: Txn[], fixedIds: Set<string>): number {
  return txns
    .filter((t) => t.type === "expense" && !(t.category_id && fixedIds.has(t.category_id)))
    .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
}

export function fixedVariableFromInsights(
  insights: { categoryId: string; total: number }[],
  fixedIds: Set<string>
): { fixe: number; variable: number; fixedShare: number } {
  let fixe = 0;
  let variable = 0;
  for (const i of insights) {
    if (fixedIds.has(i.categoryId)) fixe += Number(i.total);
    else variable += Number(i.total);
  }
  const total = fixe + variable;
  return { fixe, variable, fixedShare: total > 0 ? fixe / total : 0 };
}
