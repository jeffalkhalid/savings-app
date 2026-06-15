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

  it("resteAVivre = revenus - depenses (ignores savings and transfers)", () => {
    const m = computeMetrics([
      t("income", 2980),
      t("expense", -1020),
      t("savings", -1020),
      t("transfer", -320),
    ]);
    expect(m.resteAVivre).toBe(1960);
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
