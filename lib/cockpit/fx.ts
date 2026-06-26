// ratesEUR : taux EUR -> devise (EUR = 1). Devise absente → facteur 1.
export function convert(
  amount: number,
  from: string,
  to: string,
  ratesEUR: Record<string, number>
): number {
  const rf = ratesEUR[from] ?? 1;
  const rt = ratesEUR[to] ?? 1;
  return amount * (rt / rf);
}

export function money(amount: number, ccy: string): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: ccy,
  }).format(amount);
}
