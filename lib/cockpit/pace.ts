import { daysInMonth } from "./budget-month";

/**
 * Tenue du mois en cours : ce qu'il reste réellement, par jour, et où l'on
 * finira au rythme actuel.
 *
 * Le module ne prend que des nombres et une date : tout ce dont il a besoin est
 * déjà calculé par le Cockpit, et le garder ignorant des transactions le rend
 * trivialement testable.
 */
export type MonthPace = {
  /** Reste à vivre du mois moins les engagements attendus non encore prélevés. */
  disponible: number;
  joursEcoules: number;
  /** Inclut le jour courant : on peut encore dépenser aujourd'hui. */
  joursRestants: number;
  /** disponible / joursRestants, jamais négatif. */
  parJour: number;
  /** Dépenses variables du mois ÷ jours écoulés. */
  rythmeVariable: number;
  /**
   * disponible − rythmeVariable × (joursRestants − 1) ; null avant le seuil.
   * L'extrapolation ne porte que sur les jours APRÈS aujourd'hui : la dépense
   * d'aujourd'hui est déjà comptée une fois dans `variable`, donc dans
   * `disponible`. Le dernier jour du mois, joursRestants vaut 1 et finDeMois
   * égale exactement disponible — le mois est fini, il n'y a plus rien à
   * extrapoler.
   */
  finDeMois: number | null;
};

/**
 * Jour du mois à partir duquel la projection est affichée.
 *
 * Avant, une seule grosse dépense multiplie par dix et annonce la ruine ; le
 * lendemain d'une journée calme, l'abondance. Une projection qui oscille ainsi
 * n'informe pas, et elle décrédibilise le disponible affiché juste à côté, qui
 * lui est un fait.
 */
export const PROJECTION_FROM_DAY = 8;

export function monthPace(input: {
  resteAVivre: number;
  pendingEngagements: number;
  variable: number;
  today: string;
}): MonthPace {
  const [, , d] = input.today.split("-").map(Number);
  const total = daysInMonth(input.today.slice(0, 7));

  const joursEcoules = d;
  // Inclut aujourd'hui : on peut encore dépenser aujourd'hui, donc le budget
  // journalier doit compter ce jour comme un jour à couvrir.
  const joursRestants = total - d + 1;

  const disponible = input.resteAVivre - input.pendingEngagements;
  const parJour = disponible > 0 ? disponible / joursRestants : 0;
  const rythmeVariable = joursEcoules > 0 ? input.variable / joursEcoules : 0;

  // Contrairement à joursRestants, l'extrapolation exclut aujourd'hui : la
  // dépense du jour est déjà dans `variable` (donc dans `disponible`) ; la
  // recompter ici la compterait deux fois. D'où (joursRestants − 1).
  const finDeMois =
    d >= PROJECTION_FROM_DAY
      ? disponible - rythmeVariable * (joursRestants - 1)
      : null;

  return {
    disponible,
    joursEcoules,
    joursRestants,
    parJour,
    rythmeVariable,
    finDeMois,
  };
}
