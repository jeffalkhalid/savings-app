export const eur = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);

/**
 * Date civile d'une instant, dans le fuseau de l'utilisateur.
 *
 * Surtout pas `toISOString().slice(0, 10)` : celui-ci rend la date UTC, donc
 * la veille pendant les premières heures de chaque journée à Paris. Le
 * sélecteur de mois, la carte « Tenue du mois » et l'écran Dérive dérivent
 * tous de cette fonction — le 1er du mois à 00 h 30, ils affichaient encore
 * le mois précédent.
 *
 * Exporté pour être testable sans toucher à l'horloge du système.
 */
export function localISO(d: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

export const todayISO = () => localISO(new Date());

export const currentMonth = () => todayISO().slice(0, 7);

export function monthRange(month: string): { start: string; next: string } {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const next =
    m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { start, next };
}

// Les deux formateurs partagent la convention "minuit local" du reste du
// cockpit : `new Date(`${m}-01T00:00:00`)`. Un `new Date("2026-08")` nu
// parse en UTC et peut faire reculer le mois d'un cran dans les fuseaux à
// décalage négatif.

/** Étiquette compacte pour les graduations d'axe : "août". */
export const axisMonthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString("fr-FR", { month: "short" });

/**
 * Étiquette avec année pour les infobulles : "août 25". Sur un historique de
 * 13 mois ou plus, le mois seul est ambigu (deux "août" possibles) ; les
 * infobulles doivent toujours désambiguïser.
 */
export const tooltipMonthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString("fr-FR", {
    month: "short",
    year: "2-digit",
  });

/**
 * Étiquette calendaire d'un décalage en mois depuis aujourd'hui : « dans 14
 * mois » → « nov. 2027 ». Utilisée par les scénarios de choc, qui raisonnent
 * en numéro de mois (voir `lib/cockpit/shock.ts`) mais doivent s'afficher en
 * date — jamais « Mois 14 ».
 *
 * Le jour est fixé au 1er AVANT d'ajouter les mois : sans cela, poser la date
 * un 31 fait « rouler » `setMonth` sur le mois suivant dès que le mois visé a
 * moins de 31 jours (ex. 31 janvier + 1 mois → 3 mars, pas février).
 */
export function monthOffsetLabel(offset: number, from = new Date()): string {
  const d = new Date(from);
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return d.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
}
