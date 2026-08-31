import type { Txn } from "./types";
import { merchantKey } from "./payee-key";

/**
 * Rattachement d'un revenu au mois suivant.
 *
 * Un salaire versé le dernier jour ouvré du mois finance le mois suivant. On ne
 * touche jamais à la date stockée : seule l'attribution mensuelle change.
 */
export type SalaryShift = {
  /** Clés commerçant qui déclenchent le rattachement. */
  payeeKeys: string[];
  /** Garde-fou : catégories concernées. */
  categoryIds: string[];
  /** Taille de la fenêtre de fin de mois, en jours. */
  days: number;
};

/** Listes vides : aucune transaction ne se déplace. */
export const DEFAULT_SHIFT: SalaryShift = {
  payeeKeys: [],
  categoryIds: [],
  days: 4,
};

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  // Le jour 0 du mois suivant est le dernier jour du mois demandé.
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12
    ? `${y + 1}-01`
    : `${y}-${String(m + 1).padStart(2, "0")}`;
}

function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1
    ? `${y - 1}-12`
    : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/**
 * Premier jour du mois PRÉCÉDENT dont une transaction peut être rattachée à
 * `month`. Pilote l'élargissement de la requête.
 */
export function shiftWindowStart(month: string, days: number): string {
  const prev = previousMonth(month);
  const firstDay = daysInMonth(prev) - days + 1;
  return `${prev}-${String(firstDay).padStart(2, "0")}`;
}

/** Les quatre conditions, toutes requises. */
export function isShifted(t: Txn, s: SalaryShift): boolean {
  if (t.type !== "income") return false;
  if (!t.category_id) return false;
  if (!s.payeeKeys.length || !s.categoryIds.length) return false;
  if (!s.categoryIds.includes(t.category_id)) return false;
  if (!s.payeeKeys.includes(merchantKey(t.description))) return false;

  const month = t.date.slice(0, 7);
  const day = Number(t.date.slice(8, 10));
  return day > daysInMonth(month) - s.days;
}

/** Mois budgétaire d'une transaction, au format YYYY-MM. */
export function budgetMonthOf(t: Txn, s: SalaryShift): string {
  const month = t.date.slice(0, 7);
  return isShifted(t, s) ? nextMonth(month) : month;
}

const MIN_DAYS = 1;
const MAX_DAYS = 15;

const stringsOf = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/**
 * Lit une configuration venue de la base (JSONB) ou d'un formulaire.
 * Ne lève jamais : tout ce qui est invalide retombe sur DEFAULT_SHIFT.
 */
export function parseSalaryShift(raw: unknown): SalaryShift {
  try {
    if (!raw || typeof raw !== "object") return { ...DEFAULT_SHIFT, payeeKeys: [], categoryIds: [] };
    const r = raw as Record<string, unknown>;
    const days = Number(r.days);
    return {
      payeeKeys: stringsOf(r.payeeKeys),
      categoryIds: stringsOf(r.categoryIds),
      days:
        Number.isInteger(days) && days >= MIN_DAYS && days <= MAX_DAYS
          ? days
          : DEFAULT_SHIFT.days,
    };
  } catch {
    return { ...DEFAULT_SHIFT, payeeKeys: [], categoryIds: [] };
  }
}
