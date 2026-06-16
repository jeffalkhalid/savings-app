import type { Txn } from "./types";

// Moyenne, sur les mois présents, de (income - expense). transfer/savings neutres.
export function averageMonthlyNet(txns: Txn[]): number {
  const byMonth = new Map<string, number>();
  for (const t of txns) {
    // Seuls income/expense bougent le patrimoine ; un mois qui n'a que des
    // transfer/savings ne doit pas créer un mois à net 0 qui dilue la moyenne.
    if (t.type !== "income" && t.type !== "expense") continue;
    const month = t.date.slice(0, 7);
    const amt = Math.abs(Number(t.amount));
    const delta = t.type === "income" ? amt : -amt;
    byMonth.set(month, (byMonth.get(month) ?? 0) + delta);
  }
  if (byMonth.size === 0) return 0;
  let sum = 0;
  for (const v of byMonth.values()) sum += v;
  return sum / byMonth.size;
}

// Capitalisation annuelle, annuité de fin de période.
// value(t) = initial*(1+r)^t + C*((1+r)^t - 1)/r ; r=0 => initial + C*t ; t=0 => initial.
export function projectNetWorth(input: {
  initial: number;
  annualContribution: number;
  rate: number;
  years: number;
}): { year: number; value: number }[] {
  const { initial, annualContribution, rate, years } = input;
  const series: { year: number; value: number }[] = [];
  for (let t = 0; t <= years; t++) {
    const value =
      rate === 0
        ? initial + annualContribution * t
        : initial * (1 + rate) ** t +
          annualContribution * (((1 + rate) ** t - 1) / rate);
    series.push({ year: t, value });
  }
  return series;
}
