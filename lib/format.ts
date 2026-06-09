const eurFormatter0 = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const eurFormatter2 = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const pctFormatter = new Intl.NumberFormat("fr-FR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

export function formatEuro(n: number, decimals = 0): string {
  if (!isFinite(n)) return "—";
  return decimals === 0 ? eurFormatter0.format(n) : eurFormatter2.format(n);
}

export function formatPercent(n: number): string {
  if (!isFinite(n)) return "—";
  return pctFormatter.format(n);
}

export function formatMultiplier(n: number): string {
  if (!isFinite(n)) return "—";
  return `${n.toFixed(2)}×`;
}
