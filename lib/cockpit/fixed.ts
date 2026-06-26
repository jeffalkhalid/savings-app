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
