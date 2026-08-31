import type { ParsedRow } from "./bnp-import";
import { mapBnpCategory } from "./bnp-import";
import { merchantKey } from "./payee-key";
import { classifyTransfer, targetCategoryName } from "./classify-transfer";
import type { Txn } from "./types";

export type Provenance = "rule" | "history" | "bnp" | "transfer" | "guess";

export type ClassifiedRow = ParsedRow & {
  payeeKey: string;
  categoryName: string;
  provenance: Provenance;
};

export type ClassifyContext = {
  /** payee_key → category_id, décisions explicites de l'utilisateur. */
  rulesByKey: Map<string, string>;
  /** category_id → nom, pour résoudre les règles. */
  categoryNameById: Map<string, string>;
  /** payee_key → nom de catégorie, appris de l'historique. */
  historyByKey: Map<string, string>;
};

/** Catégorie neutre où atterrit tout ce que la cascade ne sait pas classer. */
export const FALLBACK_CATEGORY = "Autres";

/**
 * Apprend, depuis les transactions déjà catégorisées, quelle catégorie
 * l'utilisateur associe à chaque commerçant. En cas d'hésitation, la catégorie
 * la plus fréquente gagne.
 */
export function buildHistoryMap(
  txns: Txn[],
  categoryNameById: Map<string, string>
): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const t of txns) {
    if (!t.category_id) continue;
    const name = categoryNameById.get(t.category_id);
    if (!name) continue;
    const key = merchantKey(t.description);
    if (!key) continue;
    const byName = counts.get(key) ?? new Map<string, number>();
    byName.set(name, (byName.get(name) ?? 0) + 1);
    counts.set(key, byName);
  }
  const out = new Map<string, string>();
  for (const [key, byName] of counts) {
    let best = "";
    let bestN = -1;
    for (const [name, n] of byName) {
      if (n > bestN) {
        bestN = n;
        best = name;
      }
    }
    if (best) out.set(key, best);
  }
  return out;
}

const isTransferLabel = (r: ParsedRow): boolean =>
  /^VIR|^VIREMENT/i.test(r.operationType || r.shortLabel || r.label);

/** Devinette volontairement timide : seuls les frais bancaires sont devinés. */
function guess(r: ParsedRow): string {
  const t = (r.operationType || r.shortLabel || "").toUpperCase();
  if (t.includes("COMMISSION")) return "Frais bancaires";
  return FALLBACK_CATEGORY;
}

export function classifyRows(
  rows: ParsedRow[],
  ctx: ClassifyContext
): ClassifiedRow[] {
  return rows.map((r) => {
    const payeeKey = merchantKey(r.label);

    // 1. Règle explicite
    const ruleCatId = ctx.rulesByKey.get(payeeKey);
    if (ruleCatId) {
      const name = ctx.categoryNameById.get(ruleCatId);
      if (name) return { ...r, payeeKey, categoryName: name, provenance: "rule" };
    }

    // 2. Historique
    const fromHistory = ctx.historyByKey.get(payeeKey);
    if (fromHistory) {
      return { ...r, payeeKey, categoryName: fromHistory, provenance: "history" };
    }

    // 3. Catégories BNP, quand l'export les fournit
    if (r.bnpCategory || r.bnpSubCategory) {
      return {
        ...r,
        payeeKey,
        categoryName: mapBnpCategory(r.bnpCategory, r.bnpSubCategory),
        provenance: "bnp",
      };
    }

    // 4. Virements
    if (isTransferLabel(r)) {
      return {
        ...r,
        payeeKey,
        categoryName: targetCategoryName(
          classifyTransfer(r.amount, r.label),
          r.label
        ),
        provenance: "transfer",
      };
    }

    // 5. Devinette
    return { ...r, payeeKey, categoryName: guess(r), provenance: "guess" };
  });
}
