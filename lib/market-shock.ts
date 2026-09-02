/**
 * Chocs de marché datés, traduits en un facteur de croissance par année.
 *
 * Deux natures volontairement différentes : un **rendement** est un régime, il
 * REMPLACE le taux de base sur sa fenêtre ; un **krach** est un événement, il
 * MULTIPLIE le facteur de son année. C'est ce qui permet de poser un krach à
 * l'intérieur d'une période déjà dégradée sans que l'un annule l'autre.
 */
export type MarketShock =
  /** Les encours perdent `dropPct` à la fin de l'année `atYear`. */
  | { kind: "krach"; atYear: number; dropPct: number }
  /** Le rendement vaut `rate` pendant `years` ans à partir de `startYear`. */
  | { kind: "rendement"; startYear: number; years: number; rate: number };

export function yearFactors(input: {
  rate: number;
  years: number;
  shocks: MarketShock[];
}): number[] {
  const { rate, years, shocks } = input;
  const n = Math.max(0, Math.round(years));

  // `1 + rate` calculé UNE fois et réutilisé tel quel : sans choc, chaque
  // facteur est le même float, et le simulateur retrouve exactement ses
  // chiffres d'aujourd'hui.
  const base = 1 + rate;
  const out: number[] = new Array(n).fill(base);

  for (const s of shocks) {
    if (s.kind === "rendement") {
      const end = Math.min(n, s.startYear + s.years);
      for (let t = Math.max(0, s.startYear); t < end; t++) {
        out[t] = 1 + s.rate;
      }
    }
  }
  // Les krachs sont appliqués APRÈS les fenêtres de rendement : sinon une
  // fenêtre posée ensuite écraserait le krach qu'elle recouvre.
  for (const s of shocks) {
    if (s.kind === "krach" && s.atYear >= 0 && s.atYear < n) {
      out[s.atYear] *= 1 - s.dropPct;
    }
  }
  return out;
}
