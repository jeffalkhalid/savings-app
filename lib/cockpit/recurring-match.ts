import type { Txn } from "./types";
import { normalizePayee } from "./recurring-detect";

export type ChargeLite = { payeeKey: string; expected: number };
export type ChargeStatus = "paye" | "a_venir" | "hausse" | "baisse";

export type ChargeMatch = {
  payeeKey: string;
  expected: number;
  actual: number | null;
  status: ChargeStatus;
  driftPct: number | null;
};

export function matchMonth(
  charges: ChargeLite[],
  monthTxns: Txn[]
): ChargeMatch[] {
  const spent = new Map<string, number>();
  for (const t of monthTxns) {
    if (t.type !== "expense") continue;
    const k = normalizePayee(t.description);
    spent.set(k, (spent.get(k) ?? 0) + Math.abs(Number(t.amount)));
  }
  return charges.map((c) => {
    const actual = spent.has(c.payeeKey)
      ? (spent.get(c.payeeKey) as number)
      : null;
    if (actual === null) {
      return {
        payeeKey: c.payeeKey,
        expected: c.expected,
        actual: null,
        status: "a_venir" as const,
        driftPct: null,
      };
    }
    const driftPct = c.expected > 0 ? (actual - c.expected) / c.expected : 0;
    const status: ChargeStatus =
      driftPct > 0.15 ? "hausse" : driftPct < -0.15 ? "baisse" : "paye";
    return { payeeKey: c.payeeKey, expected: c.expected, actual, status, driftPct };
  });
}

export function engagementsTotals(
  matches: ChargeMatch[],
  monthExpenseTotal: number
): { expectedTotal: number; paid: number; pending: number; variable: number } {
  let expectedTotal = 0;
  let paid = 0;
  let pending = 0;
  for (const m of matches) {
    expectedTotal += m.expected;
    if (m.actual === null) pending += m.expected;
    else paid += m.actual;
  }
  return {
    expectedTotal,
    paid,
    pending,
    variable: Math.max(0, monthExpenseTotal - paid),
  };
}
