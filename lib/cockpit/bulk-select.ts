import type { Txn } from "./types";
import { merchantKey } from "./payee-key";

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

/**
 * Règles déduites d'une sélection de transactions déjà enregistrées : une par
 * commerçant distinct, comme à l'import. Reclasser dix lignes du même
 * commerçant n'enseigne qu'une seule chose à l'app.
 */
export function rulesFromTxns(
  txns: Txn[],
  categoryId: string
): { payeeKey: string; categoryId: string }[] {
  const keys = new Set<string>();
  for (const t of txns) {
    const key = merchantKey(t.description);
    if (key) keys.add(key);
  }
  return [...keys].map((payeeKey) => ({ payeeKey, categoryId }));
}

/**
 * Compte et total d'une sélection à supprimer.
 *
 * Le total est **signé**, pas en valeur absolue : une sélection qui mêle une
 * dépense et un remboursement doit se lire pour ce qu'elle est. Un écran de
 * confirmation qui annonce « 80 € » là où la sélection vaut −80 € ment sur le
 * sens du geste, juste avant un geste irréversible.
 */
export function deletionTotals(txns: Txn[]): { count: number; total: number } {
  let total = 0;
  for (const t of txns) total += Number(t.amount);
  return { count: txns.length, total };
}

export function deleteSummary(count: number): string {
  return count > 1
    ? `${count} opérations supprimées`
    : `${count} opération supprimée`;
}
