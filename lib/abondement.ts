/**
 * Barème d'abondement employeur, décrit par tranches.
 * `upTo` = borne haute de la tranche en euros ; `null` = « au-delà » (non plafonné).
 * Les tranches sont ordonnées par `upTo` croissant, `null` en dernier.
 */
export type Tranche = { upTo: number | null; rate: number };

export type SourceKey = "interessement" | "participation" | "volontaire";

export type PlanBareme = Record<SourceKey, Tranche[]>;

export type AbondementBareme = { peg: PlanBareme; per: PlanBareme };

export const SOURCE_KEYS = [
  "interessement",
  "participation",
  "volontaire",
] as const satisfies readonly SourceKey[];

export const SOURCE_LABELS: Record<SourceKey, string> = {
  interessement: "Intéressement",
  participation: "Participation",
  volontaire: "Volontaire",
};

/** Barème Carrefour — valeurs historiques de lib/simulator.ts. */
export const DEFAULT_BAREME: AbondementBareme = {
  peg: {
    interessement: [
      { upTo: 450, rate: 0.4 },
      { upTo: null, rate: 0.2 },
    ],
    participation: [],
    volontaire: [{ upTo: null, rate: 0.2 }],
  },
  per: {
    interessement: [
      { upTo: 1000, rate: 0.5 },
      { upTo: null, rate: 0.2 },
    ],
    participation: [{ upTo: null, rate: 0.3 }],
    volontaire: [
      { upTo: 550, rate: 1.0 },
      { upTo: 2000, rate: 0.5 },
      { upTo: null, rate: 0.25 },
    ],
  },
};

/** Applique un barème de tranches à un montant annuel versé. */
function applyTranches(tranches: Tranche[], amount: number): number {
  const a = Math.max(0, amount);
  let previous = 0;
  let total = 0;
  for (const t of tranches) {
    const upper = t.upTo === null ? Infinity : t.upTo;
    const slice = Math.max(0, Math.min(a, upper) - previous);
    total += slice * t.rate;
    previous = upper;
    if (a <= upper) break;
  }
  return total;
}

/**
 * Abondement employeur total pour un plan, à partir des versements annuels
 * bruts : I = intéressement, P = participation, V = volontaire.
 */
export function computeAbondement(
  plan: PlanBareme,
  I: number,
  P: number,
  V: number
): number {
  return (
    applyTranches(plan.interessement, I) +
    applyTranches(plan.participation, P) +
    applyTranches(plan.volontaire, V)
  );
}

const PLAN_LABELS = { peg: "PEG", per: "PER" } as const;

function trancheListError(list: unknown, where: string): string | null {
  if (!Array.isArray(list)) return `${where} : liste de tranches invalide.`;
  let previous = 0;
  for (let i = 0; i < list.length; i++) {
    const t = list[i] as Tranche;
    if (!t || typeof t !== "object") return `${where} : tranche invalide.`;
    const rate = Number(t.rate);
    if (!isFinite(rate) || rate < 0 || rate > 2)
      return `${where} : taux invalide (entre 0 et 200 %).`;
    if (t.upTo === null) {
      if (i !== list.length - 1)
        return `${where} : la tranche « au-delà » doit être la dernière.`;
      continue;
    }
    const upTo = Number(t.upTo);
    if (!isFinite(upTo) || upTo <= 0)
      return `${where} : seuil invalide (montant positif attendu).`;
    if (upTo <= previous)
      return `${where} : les seuils doivent être croissants.`;
    previous = upTo;
  }
  return null;
}

function planError(plan: unknown, planLabel: string): string | null {
  if (!plan || typeof plan !== "object")
    return `${planLabel} : barème manquant.`;
  for (const key of SOURCE_KEYS) {
    const err = trancheListError(
      (plan as Record<string, unknown>)[key],
      `${planLabel} · ${SOURCE_LABELS[key]}`
    );
    if (err) return err;
  }
  return null;
}

/** Message d'erreur en français, ou null si le barème est exploitable. */
export function baremeError(b: unknown): string | null {
  if (!b || typeof b !== "object") return "Barème manquant ou illisible.";
  const rec = b as Record<string, unknown>;
  return (
    planError(rec.peg, PLAN_LABELS.peg) ?? planError(rec.per, PLAN_LABELS.per)
  );
}

function clonePlan(p: PlanBareme): PlanBareme {
  return {
    interessement: p.interessement.map((t) => ({ ...t })),
    participation: p.participation.map((t) => ({ ...t })),
    volontaire: p.volontaire.map((t) => ({ ...t })),
  };
}

export function cloneBareme(b: AbondementBareme): AbondementBareme {
  return { peg: clonePlan(b.peg), per: clonePlan(b.per) };
}

/**
 * Lit un barème venu de la base (JSONB) ou d'un formulaire.
 * Ne lève jamais : tout ce qui est invalide retombe sur le barème par défaut.
 */
export function parseBareme(raw: unknown): AbondementBareme {
  if (baremeError(raw) !== null) return cloneBareme(DEFAULT_BAREME);
  const b = raw as AbondementBareme;
  return cloneBareme({
    peg: normalizePlan(b.peg),
    per: normalizePlan(b.per),
  });
}

function normalizePlan(p: PlanBareme): PlanBareme {
  return {
    interessement: p.interessement.map(normalizeTranche),
    participation: p.participation.map(normalizeTranche),
    volontaire: p.volontaire.map(normalizeTranche),
  };
}

function normalizeTranche(t: Tranche): Tranche {
  return {
    upTo: t.upTo === null ? null : Number(t.upTo),
    rate: Number(t.rate),
  };
}

/** Vrai si le barème est exactement le barème Carrefour par défaut. */
export function isDefaultBareme(b: AbondementBareme): boolean {
  return JSON.stringify(b) === JSON.stringify(DEFAULT_BAREME);
}
