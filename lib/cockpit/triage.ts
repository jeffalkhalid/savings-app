import type { Txn } from "./types";
import { merchantKey } from "./payee-key";

/**
 * La file de tri : les commerçants dont il reste des lignes non classées.
 *
 * Par commerçant et non par opération, parce qu'une décision par commerçant
 * règle toutes ses lignes d'un geste et enseigne une règle à l'app — 847
 * lignes se replient en quelques dizaines de décisions.
 */
export type TriageMerchant = {
  key: string;
  /** Libellé le plus fréquent du groupe. */
  label: string;
  /** Opérations NON classées seulement. */
  count: number;
  /** Somme en valeur absolue des opérations non classées. */
  total: number;
  firstDate: string;
  lastDate: string;
  /** Jusqu'à 4 libellés distincts, le plus fréquent d'abord. */
  samples: string[];
  /** Nom de catégorie proposé, ou null quand l'app ne sait pas. */
  suggestion: string | null;
};

const FALLBACK = "Autres";
const MAX_SAMPLES = 4;

/** Une ligne est non classée si elle n'a pas de catégorie utilisable. */
function isUnsorted(
  t: Txn,
  names: Map<string, string>,
  fallback: string
): boolean {
  if (!t.category_id) return true;
  const name = names.get(t.category_id);
  // Une catégorie supprimée laisse un identifiant orphelin : la ligne n'est
  // pas classée pour autant.
  if (!name) return true;
  return name === fallback;
}

/** Clé du plus grand compteur d'une map, `null` si elle est vide. */
function topOf(counts: Map<string, number>): string | null {
  let best: string | null = null;
  let n = -1;
  for (const [k, c] of counts) {
    if (c > n) {
      n = c;
      best = k;
    }
  }
  return best;
}

/**
 * Ce que l'app peut honnêtement proposer, dans l'ordre d'essai.
 *
 * Les catégories de l'export BNP ne sont PAS une source ici : elles existent
 * à l'import mais ne sont stockées nulle part, donc elles n'existent pas pour
 * les lignes déjà en base. Quand aucune source ne parle, on ne propose rien —
 * une suggestion fausse serait acceptée d'un tap au vingtième écran.
 */
function suggest(
  sortedCategoryCounts: Map<string, number>,
  samples: string[],
  signedTotal: number,
  names: Map<string, string>
): string | null {
  // 1. L'historique partiel du commerçant : le signal le plus fort.
  const fromHistory = topOf(sortedCategoryCounts);
  if (fromHistory) return fromHistory;

  const known = new Set(names.values());
  const first = samples[0] ?? "";

  // 2. Motif de virement, comme `isTransferLabel` dans classify.ts.
  if (/^VIR|^VIREMENT/i.test(first)) {
    const name = signedTotal >= 0 ? "Virements reçus" : "Virements émis";
    return known.has(name) ? name : null;
  }

  // 3. La devinette timide existante.
  if (first.toUpperCase().includes("COMMISSION")) {
    return known.has("Frais bancaires") ? "Frais bancaires" : null;
  }

  return null;
}

export function triageQueue(input: {
  txns: Txn[];
  categoryNameById: Map<string, string>;
  ruledKeys: Set<string>;
  fallbackName?: string;
}): TriageMerchant[] {
  const { txns, categoryNameById: names, ruledKeys } = input;
  const fallback = input.fallbackName ?? FALLBACK;

  type Group = {
    count: number;
    total: number;
    signedTotal: number;
    firstDate: string;
    lastDate: string;
    labels: Map<string, number>;
    sortedCats: Map<string, number>;
  };
  const groups = new Map<string, Group>();

  for (const t of txns) {
    const key = merchantKey(t.description);
    if (!key) continue;
    if (ruledKeys.has(key)) continue;

    const g =
      groups.get(key) ??
      {
        count: 0,
        total: 0,
        signedTotal: 0,
        firstDate: "",
        lastDate: "",
        labels: new Map<string, number>(),
        sortedCats: new Map<string, number>(),
      };
    groups.set(key, g);

    if (!isUnsorted(t, names, fallback)) {
      // Ligne déjà classée : elle ne pèse pas dans la file, mais elle informe
      // la suggestion.
      const name = names.get(t.category_id as string) as string;
      g.sortedCats.set(name, (g.sortedCats.get(name) ?? 0) + 1);
      continue;
    }

    g.count += 1;
    g.total += Math.abs(Number(t.amount));
    g.signedTotal += Number(t.amount);
    if (!g.firstDate || t.date < g.firstDate) g.firstDate = t.date;
    if (t.date > g.lastDate) g.lastDate = t.date;
    g.labels.set(t.description, (g.labels.get(t.description) ?? 0) + 1);
  }

  const out: TriageMerchant[] = [];
  for (const [key, g] of groups) {
    if (!g.count) continue;

    const samples = [...g.labels.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_SAMPLES)
      .map(([label]) => label);

    out.push({
      key,
      label: samples[0] ?? key,
      count: g.count,
      total: g.total,
      firstDate: g.firstDate,
      lastDate: g.lastDate,
      samples,
      suggestion: suggest(g.sortedCats, samples, g.signedTotal, names),
    });
  }

  return out.sort((a, b) => b.total - a.total);
}

/**
 * Les catégories où l'utilisateur classe le plus, pour que les propositions
 * de l'écran soient les siennes et non celles du seed.
 */
export function frequentCategories(
  txns: Txn[],
  categoryNameById: Map<string, string>,
  n: number,
  fallbackName?: string
): string[] {
  const fallback = fallbackName ?? FALLBACK;
  const counts = new Map<string, number>();
  for (const t of txns) {
    if (!t.category_id) continue;
    const name = categoryNameById.get(t.category_id);
    if (!name || name === fallback) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name]) => name);
}
