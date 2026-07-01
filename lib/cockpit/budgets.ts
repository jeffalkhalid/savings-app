export type BudgetRow = { category_id: string; monthly_budget: number };

export function budgetsToMap(rows: BudgetRow[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const r of rows) map[r.category_id] = Number(r.monthly_budget);
  return map;
}
