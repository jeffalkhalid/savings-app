import { describe, it, expect } from "vitest";
import {
  averageMonthlyNet,
  averageMonthlyIncome,
  projectNetWorth,
} from "./projection";
import type { Txn } from "./types";

const tx = (type: Txn["type"], amount: number, date: string): Txn => ({
  id: date + type + amount,
  date,
  amount,
  description: "",
  type,
});

describe("averageMonthlyNet", () => {
  it("returns income - expense for a single month", () => {
    expect(
      averageMonthlyNet([
        tx("income", 3000, "2026-05-02"),
        tx("expense", -1000, "2026-05-10"),
      ])
    ).toBe(2000);
  });

  it("averages the monthly nets across months", () => {
    expect(
      averageMonthlyNet([
        tx("income", 3000, "2026-04-02"),
        tx("expense", -1000, "2026-04-10"),
        tx("income", 3000, "2026-05-02"),
        tx("expense", -2000, "2026-05-10"),
      ])
    ).toBe(1500);
  });

  it("ignores transfer and savings", () => {
    expect(
      averageMonthlyNet([
        tx("income", 1000, "2026-05-02"),
        tx("transfer", -500, "2026-05-03"),
        tx("savings", -300, "2026-05-04"),
      ])
    ).toBe(1000);
  });

  it("does not count a savings/transfer-only month in the average", () => {
    expect(
      averageMonthlyNet([
        tx("income", 3000, "2026-01-02"),
        tx("expense", -1000, "2026-01-10"), // Jan net 2000
        tx("savings", -500, "2026-02-05"), // Feb: savings only, excluded
      ])
    ).toBe(2000);
  });

  it("returns 0 for an empty list", () => {
    expect(averageMonthlyNet([])).toBe(0);
  });
});

describe("projectNetWorth", () => {
  it("starts at the initial value and has years+1 points", () => {
    const s = projectNetWorth({
      initial: 10000,
      annualContribution: 1200,
      rate: 0.05,
      years: 3,
    });
    expect(s[0]).toEqual({ year: 0, value: 10000 });
    expect(s).toHaveLength(4);
  });

  it("compounds initial and contribution", () => {
    const s = projectNetWorth({
      initial: 10000,
      annualContribution: 1200,
      rate: 0.05,
      years: 1,
    });
    expect(s[1].value).toBeCloseTo(11700);
  });

  it("is linear when rate is 0", () => {
    const s = projectNetWorth({
      initial: 10000,
      annualContribution: 1200,
      rate: 0,
      years: 2,
    });
    expect(s.map((p) => p.value)).toEqual([10000, 11200, 12400]);
  });

  it("pure compounding when contribution is 0", () => {
    const s = projectNetWorth({
      initial: 1000,
      annualContribution: 0,
      rate: 0.1,
      years: 2,
    });
    expect(s[2].value).toBeCloseTo(1210);
  });
});

describe("averageMonthlyIncome", () => {
  it("moyenne les revenus sur les mois observés", () => {
    expect(
      averageMonthlyIncome([
        tx("income", 3000, "2026-04-02"),
        tx("expense", -1000, "2026-04-10"),
        tx("income", 3200, "2026-05-02"),
      ])
    ).toBeCloseTo(3100);
  });

  it("ne compte pas un mois sans revenu comme un zéro", () => {
    // Un mois qui n'a que des dépenses ne doit pas diluer la moyenne : le
    // revenu mesuré sert à chiffrer ce qu'une perte d'emploi retranche.
    expect(
      averageMonthlyIncome([
        tx("income", 3000, "2026-04-02"),
        tx("expense", -1000, "2026-05-10"),
      ])
    ).toBeCloseTo(3000);
  });

  it("ignore virements et épargne", () => {
    expect(
      averageMonthlyIncome([
        tx("income", 2000, "2026-04-02"),
        tx("transfer", 900, "2026-04-03"),
        tx("savings", -500, "2026-04-04"),
      ])
    ).toBeCloseTo(2000);
  });

  it("rend 0 sans transaction", () => {
    expect(averageMonthlyIncome([])).toBe(0);
  });
});
