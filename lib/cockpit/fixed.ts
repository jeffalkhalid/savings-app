export type Recurring = {
  id: string;
  name: string;
  amount: number;
  day_of_month: number | null;
  frequency: string;
  category_id: string | null;
  account_id: string | null;
  active: boolean;
};

const FREQ_TO_MONTHLY: Record<string, number> = {
  monthly: 1,
  yearly: 1 / 12,
  quarterly: 1 / 3,
  weekly: 52 / 12,
};

// Montant normalisé au mois selon la fréquence (défaut = mensuel).
export function monthlyAmount(r: Recurring): number {
  const m = FREQ_TO_MONTHLY[r.frequency] ?? 1;
  return Math.abs(Number(r.amount)) * m;
}

// Σ des montants mensualisés des lignes actives.
export function monthlyFixedTotal(recurring: Recurring[]): number {
  return recurring
    .filter((r) => r.active)
    .reduce((sum, r) => sum + monthlyAmount(r), 0);
}

export function fixedVariableSplit(
  depenses: number,
  fixedTotal: number
): { fixe: number; variable: number; fixedShare: number } {
  const fixe = fixedTotal;
  const variable = Math.max(0, depenses - fixedTotal);
  const total = fixe + variable;
  return { fixe, variable, fixedShare: total > 0 ? fixe / total : 0 };
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
