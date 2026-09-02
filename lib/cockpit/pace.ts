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
  /** disponible − rythmeVariable × joursRestants ; null avant le seuil. */
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

function daysInMonth(y: number, m: number): number {
  // Le jour 0 du mois suivant est le dernier jour du mois demandé.
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthPace(input: {
  resteAVivre: number;
  pendingEngagements: number;
  variable: number;
  today: string;
}): MonthPace {
  const [y, m, d] = input.today.split("-").map(Number);
  const total = daysInMonth(y, m);

  const joursEcoules = d;
  const joursRestants = total - d + 1;

  const disponible = input.resteAVivre - input.pendingEngagements;
  const parJour = disponible > 0 ? disponible / joursRestants : 0;
  const rythmeVariable = joursEcoules > 0 ? input.variable / joursEcoules : 0;

  const finDeMois =
    d >= PROJECTION_FROM_DAY
      ? disponible - rythmeVariable * joursRestants
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
