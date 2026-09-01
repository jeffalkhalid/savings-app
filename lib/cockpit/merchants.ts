import type { Txn } from "./types";
import { merchantKey } from "./payee-key";

export type MerchantStat = {
  /** Clé commerçant, stable à travers les variantes de libellé. */
  key: string;
  /** Libellé d'affichage : le plus fréquent du groupe. */
  label: string;
  /** Somme des montants en valeur absolue. */
  total: number;
  count: number;
  /** Date la plus récente du groupe, ISO. */
  lastDate: string;
};

/**
 * Classe les commerçants par volume.
 *
 * Les montants sont sommés en **valeur absolue** : la question posée est
 * « quel volume passe par là », pas « quel est le solde ». Un même commerçant
 * peut d'ailleurs porter des flux dans les deux sens.
 */
export function aggregateByMerchant(txns: Txn[]): MerchantStat[] {
  const groups = new Map<
    string,
    { total: number; count: number; lastDate: string; labels: Map<string, number> }
  >();

  for (const t of txns) {
    const key = merchantKey(t.description);
    if (!key) continue;
    const g =
      groups.get(key) ??
      { total: 0, count: 0, lastDate: "", labels: new Map<string, number>() };
    g.total += Math.abs(Number(t.amount));
    g.count += 1;
    if (t.date > g.lastDate) g.lastDate = t.date;
    g.labels.set(t.description, (g.labels.get(t.description) ?? 0) + 1);
    groups.set(key, g);
  }

  const out: MerchantStat[] = [];
  for (const [key, g] of groups) {
    let label = key;
    let best = -1;
    for (const [lbl, n] of g.labels) {
      if (n > best) {
        best = n;
        label = lbl;
      }
    }
    out.push({ key, label, total: g.total, count: g.count, lastDate: g.lastDate });
  }
  return out.sort((a, b) => b.total - a.total);
}

/**
 * Totaux mensuels d'un commerçant, mois croissants. Un mois sans opération est
 * absent de la série plutôt que présent à zéro : on n'invente pas de donnée.
 */
export function merchantSeries(
  txns: Txn[],
  key: string
): { month: string; total: number }[] {
  const byMonth = new Map<string, number>();
  for (const t of txns) {
    if (merchantKey(t.description) !== key) continue;
    const m = t.date.slice(0, 7);
    byMonth.set(m, (byMonth.get(m) ?? 0) + Math.abs(Number(t.amount)));
  }
  return [...byMonth.entries()]
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
}
