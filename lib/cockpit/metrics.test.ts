import { describe, it, expect } from "vitest";
import { computeMetrics } from "./metrics";
import type { Txn } from "./types";

const t = (type: Txn["type"], amount: number): Txn => ({
  id: Math.abs(amount) + type,
  date: "2026-05-01",
  amount,
  description: type,
  type,
});

describe("computeMetrics", () => {
  it("sums each type by absolute value", () => {
    const m = computeMetrics([
      t("income", 2980),
      t("expense", -1020),
      t("savings", -1020),
      t("transfer", -320),
    ]);
    expect(m.revenus).toBe(2980);
    expect(m.depenses).toBe(1020);
    expect(m.epargne).toBe(1020);
    expect(m.transferts).toBe(320);
  });

  it("tauxEpargne = epargne / revenus", () => {
    const m = computeMetrics([t("income", 1000), t("savings", -250)]);
    expect(m.tauxEpargne).toBeCloseTo(0.25);
  });

  it("tauxEpargne is 0 when there is no income", () => {
    const m = computeMetrics([t("savings", -250)]);
    expect(m.tauxEpargne).toBe(0);
  });

  it("resteAVivre = net signé : revenus moins tout ce qui sort", () => {
    const m = computeMetrics([
      t("income", 2980),
      t("expense", -1020),
      t("savings", -1020),
      t("transfer", -320),
    ]);
    // 2980 - 1020 - 1020 - 320 = ce qui reste sur le compte.
    expect(m.resteAVivre).toBe(620);
  });

  it("resteAVivre compte les virements reçus en positif (net signé)", () => {
    const m = computeMetrics([
      t("income", 1000),
      t("transfer", 200), // virement reçu : argent qui ENTRE
      t("expense", -300),
      t("savings", -100),
    ]);
    // 1000 + 200 - 300 - 100 = 800 (et non 400 si on soustrayait |transferts|).
    expect(m.resteAVivre).toBe(800);
  });

  it("returns zeros for an empty list", () => {
    const m = computeMetrics([]);
    expect(m).toEqual({
      revenus: 0,
      depenses: 0,
      epargne: 0,
      transferts: 0,
      tauxEpargne: 0,
      resteAVivre: 0,
    });
  });
});
