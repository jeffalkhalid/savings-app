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
  /** Nombre de lignes NON classées par type d'opération. */
  typeCounts: Partial<Record<Txn["type"], number>>;
  /** Nom de catégorie proposé, ou null quand l'app ne sait pas. */
  suggestion: string | null;
};

const FALLBACK = "Autres";
const MAX_SAMPLES = 4;

/**
 * Résout la catégorie d'une ligne — le nom si elle est classée dans une vraie
 * catégorie, `null` si elle ne l'est pas.
 *
 * `names` doit porter TOUTES les catégories, actives ou archivées : archiver
 * une catégorie (`CategoriesModal`) est un choix d'affichage, pas une
 * suppression — les lignes gardent leur `category_id`, et une catégorie
 * archivée reste une vraie décision que ce tri n'a pas à écraser. Un
 * identifiant absent de `names` (catégorie réellement supprimée) reste en
 * revanche non classé.
 */
function isUnsorted(
  t: Txn,
  names: Map<string, string>,
  fallback: string
): string | null {
  if (!t.category_id) return null;
  const name = names.get(t.category_id);
  // Une catégorie supprimée laisse un identifiant orphelin : la ligne n'est
  // pas classée pour autant.
  if (!name) return null;
  return name === fallback ? null : name;
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
 *
 * `choosable` ne porte que les noms que l'utilisateur peut effectivement
 * choisir sur cet écran (catégories actives) : proposer une catégorie
 * archivée mènerait à un tap qui n'ouvre sur rien. Quand la source la plus
 * forte (l'historique) pointe vers une catégorie non choisissable, on
 * retombe sur la source suivante plutôt que de renoncer tout de suite.
 */
function suggest(
  sortedCategoryCounts: Map<string, number>,
  samples: string[],
  signedTotal: number,
  choosable: Set<string>
): string | null {
  // 1. L'historique partiel du commerçant : le signal le plus fort.
  const fromHistory = topOf(sortedCategoryCounts);
  if (fromHistory && choosable.has(fromHistory)) return fromHistory;

  const first = samples[0] ?? "";

  // 2. Motif de virement, comme `isTransferLabel` dans classify.ts. La
  // frontière de mot évite qu'un libellé comme « Virginie coiffeuse » soit
  // pris pour un virement.
  if (/^VIR(?:EMENT)?\b/i.test(first)) {
    const name = signedTotal >= 0 ? "Virements reçus" : "Virements émis";
    if (choosable.has(name)) return name;
  }

  // 3. La devinette timide existante.
  if (first.toUpperCase().includes("COMMISSION")) {
    if (choosable.has("Frais bancaires")) return "Frais bancaires";
  }

  return null;
}

export function triageQueue(input: {
  txns: Txn[];
  /** TOUTES les catégories, actives ou archivées (voir `isUnsorted`). */
  categoryNameById: Map<string, string>;
  ruledKeys: Set<string>;
  fallbackName?: string;
  /**
   * Catégories que l'écran peut effectivement proposer (actives). Par défaut,
   * les noms de `categoryNameById` — utile pour les tests, où la même map
   * sert de connue et de choisissable.
   */
  choosableNames?: Set<string>;
}): TriageMerchant[] {
  const { txns, categoryNameById: names, ruledKeys } = input;
  const fallback = input.fallbackName ?? FALLBACK;
  const choosable = input.choosableNames ?? new Set(names.values());

  type Group = {
    count: number;
    total: number;
    signedTotal: number;
    firstDate: string;
    lastDate: string;
    labels: Map<string, number>;
    sortedCats: Map<string, number>;
    typeCounts: Map<Txn["type"], number>;
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
        typeCounts: new Map<Txn["type"], number>(),
      };
    groups.set(key, g);

    const sortedName = isUnsorted(t, names, fallback);
    if (sortedName !== null) {
      // Ligne déjà classée : elle ne pèse pas dans la file, mais elle informe
      // la suggestion.
      g.sortedCats.set(sortedName, (g.sortedCats.get(sortedName) ?? 0) + 1);
      continue;
    }

    g.count += 1;
    g.total += Math.abs(Number(t.amount));
    g.signedTotal += Number(t.amount);
    g.typeCounts.set(t.type, (g.typeCounts.get(t.type) ?? 0) + 1);
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
      typeCounts: Object.fromEntries(g.typeCounts) as Partial<
        Record<Txn["type"], number>
      >,
      suggestion: suggest(g.sortedCats, samples, g.signedTotal, choosable),
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

/**
 * Ids des lignes non classées d'un commerçant, sur la même règle que la file
 * (`isUnsorted`). Exporté pour que l'écran n'ait pas à réexprimer ce filtre
 * sur une autre forme : les deux finiraient par diverger, silencieusement —
 * la file listerait un commerçant que l'écran refuse ensuite de déplacer.
 */
export function unsortedIdsFor(
  txns: Txn[],
  key: string,
  categoryNameById: Map<string, string>,
  fallbackName?: string
): string[] {
  const fallback = fallbackName ?? FALLBACK;
  const ids: string[] = [];
  for (const t of txns) {
    if (merchantKey(t.description) !== key) continue;
    if (isUnsorted(t, categoryNameById, fallback) === null) ids.push(t.id);
  }
  return ids;
}
