/**
 * Chocs de politique datés : changement de fiscalité, changement d'abondement.
 *
 * Deux familles distinctes des chocs de marché (`lib/market-shock.ts`) : un
 * choc de marché déforme la croissance, un choc de politique déforme le
 * prélèvement. Elles se cumulent sans se connaître.
 */
export type FiscalRates = {
  csgPlusValue: number;
  csgAbondement: number;
  tmi: number;
  pfuPER: number;
  csgPEA: number;
};

export type PolicyShock =
  /** À partir de `fromYear`, les taux nommés remplacent les précédents. */
  | { kind: "fiscalite"; fromYear: number; rates: Partial<FiscalRates> }
  /** À partir de `fromYear`, l'abondement calculé est multiplié par `factor`. */
  | { kind: "abondement"; fromYear: number; factor: number };

/** Année à laquelle un choc prend effet, quel que soit son type. */
const yearOf = (s: PolicyShock): number => s.fromYear;

export function ratesByYear(
  base: FiscalRates,
  years: number,
  shocks: PolicyShock[]
): FiscalRates[] {
  const n = Math.max(0, Math.round(years));
  // Sans choc, chaque année porte les valeurs de `base` telles quelles : ce
  // sont les mêmes flottants, jamais recalculés.
  const out: FiscalRates[] = new Array(n).fill(null).map(() => ({ ...base }));

  // Par année croissante : un choc tardif doit écraser un choc antérieur, quel
  // que soit l'ordre dans lequel l'utilisateur les a posés.
  const sorted = shocks
    .filter((s): s is Extract<PolicyShock, { kind: "fiscalite" }> =>
      s.kind === "fiscalite"
    )
    .sort((x, y) => yearOf(x) - yearOf(y));

  for (const s of sorted) {
    for (let t = Math.max(0, s.fromYear); t < n; t++) {
      out[t] = { ...out[t], ...s.rates };
    }
  }
  return out;
}

export function abondementFactors(
  years: number,
  shocks: PolicyShock[]
): number[] {
  const n = Math.max(0, Math.round(years));
  const out: number[] = new Array(n).fill(1);

  const sorted = shocks
    .filter((s): s is Extract<PolicyShock, { kind: "abondement" }> =>
      s.kind === "abondement"
    )
    .sort((x, y) => yearOf(x) - yearOf(y));

  // REMPLACEMENT et non multiplication : chaque facteur se lit par rapport au
  // barème d'origine, donc « divisé par deux » puis « supprimé » donne 0,5 puis
  // 0 — et non 0 dès la première fenêtre par accumulation.
  for (const s of sorted) {
    for (let t = Math.max(0, s.fromYear); t < n; t++) {
      out[t] = s.factor;
    }
  }
  return out;
}

export function exitRates(
  rates: FiscalRates[],
  base: FiscalRates
): FiscalRates {
  // La fiscalité de sortie est celle du jour où l'on sort.
  return rates.length ? rates[rates.length - 1] : base;
}
