export const eur = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);

export const todayISO = () => new Date().toISOString().slice(0, 10);

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
