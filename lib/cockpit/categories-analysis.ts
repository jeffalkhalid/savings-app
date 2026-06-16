import type { Category } from "./types";

export type MonthlyCategoryRow = {
  year_month: string;
  category_id: string;
  type: string;
  n_txns: number;
  total_abs: number;
};

export type CategoryInsight = {
  categoryId: string;
  name: string;
  total: number;
  nTxns: number;
  share: number; // 0..1
  avgPrior: number;
  deltaPct: number | null; // null = pas d'historique (nouveau)
};

// Postes de dépense du mois, triés par total décroissant, avec part et tendance.
export function analyzeCategories(
  rows: MonthlyCategoryRow[],
  month: string,
  categories: Category[]
): CategoryInsight[] {
  const expense = rows.filter((r) => r.type === "expense");
  const current = expense.filter((r) => r.year_month === month);
  const totalMonth = current.reduce((a, r) => a + Number(r.total_abs), 0);
  const nameOf = (id: string) =>
    categories.find((c) => c.id === id)?.name ?? id;

  const insights = current.map((r) => {
    const priors = expense.filter(
      (x) => x.category_id === r.category_id && x.year_month < month
    );
    const avgPrior =
      priors.length > 0
        ? priors.reduce((a, x) => a + Number(x.total_abs), 0) / priors.length
        : 0;
    const total = Number(r.total_abs);
    return {
      categoryId: r.category_id,
      name: nameOf(r.category_id),
      total,
      nTxns: Number(r.n_txns),
      share: totalMonth > 0 ? total / totalMonth : 0,
      avgPrior,
      deltaPct: avgPrior > 0 ? (total - avgPrior) / avgPrior : null,
    };
  });

  return insights.sort((a, b) => b.total - a.total);
}
