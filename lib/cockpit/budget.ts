export type BudgetState = "none" | "ok" | "warn" | "over";

export function budgetStatus(
  consumed: number,
  budget: number | null | undefined
): { ratio: number; pct: number; state: BudgetState; overBy: number } {
  const b = Number(budget);
  if (!budget || !isFinite(b) || b <= 0) {
    return { ratio: 0, pct: 0, state: "none", overBy: 0 };
  }
  const ratio = consumed / b;
  const pct = Math.min(ratio, 1) * 100;
  const state: BudgetState = ratio < 0.8 ? "ok" : ratio < 1 ? "warn" : "over";
  return { ratio, pct, state, overBy: Math.max(0, consumed - b) };
}
