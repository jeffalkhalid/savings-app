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
