import { describe, it, expect } from "vitest";
import { matchMonth, engagementsTotals } from "./recurring-match";
import type { Txn } from "./types";

const t = (over: Partial<Txn>): Txn => ({
  id: Math.random().toString(),
  date: "2026-06-05",
  amount: -50,
  description: "X",
  type: "expense",
  ...over,
});

describe("matchMonth", () => {
  const charges = [
    { payeeKey: "loyer", expected: 800 },
    { payeeKey: "netflix", expected: 14 },
    { payeeKey: "assurance", expected: 40 },
  ];
  const monthTxns = [
    t({ amount: -800, description: "LOYER" }),
    t({ amount: -20, description: "NETFLIX 06" }),
  ];
  it("matches by normalized payee and sets status/drift", () => {
    const m = matchMonth(charges, monthTxns);
    const loyer = m.find((x) => x.payeeKey === "loyer")!;
    expect(loyer.actual).toBe(800);
    expect(loyer.status).toBe("paye");
    const nf = m.find((x) => x.payeeKey === "netflix")!;
    expect(nf.status).toBe("hausse");
    expect(nf.driftPct).toBeCloseTo((20 - 14) / 14);
    const ass = m.find((x) => x.payeeKey === "assurance")!;
    expect(ass.actual).toBeNull();
    expect(ass.status).toBe("a_venir");
  });
});

describe("engagementsTotals", () => {
  it("sums paid, pending and derives variable", () => {
    const matches = matchMonth(
      [
        { payeeKey: "loyer", expected: 800 },
        { payeeKey: "assurance", expected: 40 },
      ],
      [t({ amount: -800, description: "LOYER" })]
    );
    const r = engagementsTotals(matches, 1000);
    expect(r.paid).toBe(800);
    expect(r.pending).toBe(40);
    expect(r.expectedTotal).toBe(840);
    expect(r.variable).toBe(200);
  });
});
