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
