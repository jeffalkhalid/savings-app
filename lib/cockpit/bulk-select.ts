/** Applique une catégorie aux seules lignes sélectionnées, sans muter l'entrée. */
export function applyCategoryToSelection<
  T extends { payeeKey: string; categoryName: string },
>(rows: T[], selected: Set<number>, categoryName: string): T[] {
  if (!selected.size) return rows;
  return rows.map((r, i) => (selected.has(i) ? { ...r, categoryName } : r));
}

/**
 * Une règle par commerçant distinct de la sélection : classer 47 lignes
 * Restaurants n'enseigne pas 47 fois la même chose, mais une fois par commerçant.
 */
export function rulesFromSelection<T extends { payeeKey: string }>(
  rows: T[],
  selected: Set<number>,
  categoryId: string
): { payeeKey: string; categoryId: string }[] {
  const keys = new Set<string>();
  for (const i of selected) {
    const key = rows[i]?.payeeKey;
    if (key) keys.add(key);
  }
  return [...keys].map((payeeKey) => ({ payeeKey, categoryId }));
}

export function bulkSummary(
  lineCount: number,
  ruleCount: number,
  categoryName: string
): string {
  const l = lineCount > 1 ? "lignes classées" : "ligne classée";
  const r = ruleCount > 1 ? "règles créées" : "règle créée";
  return `${lineCount} ${l} en ${categoryName}, ${ruleCount} ${r}`;
}
