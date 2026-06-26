import { describe, it, expect } from "vitest";
import {
  monthlyAmount,
  monthlyFixedTotal,
  fixedVariableSplit,
  fixedVariableFromInsights,
} from "./fixed";
import type { Recurring } from "./fixed";

const rec = (over: Partial<Recurring>): Recurring => ({
  id: "r",
  name: "x",
  amount: 100,
  day_of_month: 1,
  frequency: "monthly",
  category_id: null,
  account_id: null,
  active: true,
  ...over,
});

describe("monthlyAmount", () => {
  it("monthly = amount", () => {
    expect(monthlyAmount(rec({ amount: 800 }))).toBe(800);
  });
  it("yearly = amount/12", () => {
    expect(monthlyAmount(rec({ amount: 1200, frequency: "yearly" }))).toBeCloseTo(100);
  });
  it("quarterly = amount/3", () => {
    expect(monthlyAmount(rec({ amount: 300, frequency: "quarterly" }))).toBeCloseTo(100);
  });
  it("weekly = amount*52/12", () => {
    expect(monthlyAmount(rec({ amount: 12, frequency: "weekly" }))).toBeCloseTo(52);
  });
  it("unknown frequency defaults to monthly", () => {
    expect(monthlyAmount(rec({ amount: 50, frequency: "whatever" }))).toBe(50);
  });
  it("uses the absolute value of amount", () => {
    expect(monthlyAmount(rec({ amount: -40 }))).toBe(40);
  });
  it("coerces a string amount (PostgREST numerics arrive as strings)", () => {
    expect(monthlyAmount(rec({ amount: "800" as unknown as number }))).toBe(800);
  });
});

describe("monthlyFixedTotal", () => {
  it("sums normalized active amounts and ignores inactive", () => {
    const total = monthlyFixedTotal([
      rec({ amount: 800, frequency: "monthly" }),
      rec({ amount: 1200, frequency: "yearly" }),
      rec({ amount: 50, frequency: "monthly", active: false }),
    ]);
    expect(total).toBeCloseTo(900);
  });
  it("returns 0 for an empty list", () => {
    expect(monthlyFixedTotal([])).toBe(0);
  });
});

describe("fixedVariableSplit", () => {
  it("splits expenses into fixe and variable", () => {
    const s = fixedVariableSplit(2000, 800);
    expect(s.fixe).toBe(800);
    expect(s.variable).toBe(1200);
    expect(s.fixedShare).toBeCloseTo(0.4);
  });
  it("floors variable at 0 when expenses < fixed", () => {
    const s = fixedVariableSplit(500, 800);
    expect(s.variable).toBe(0);
    expect(s.fixe).toBe(800);
  });
  it("fixedShare is 0 when total is 0", () => {
    expect(fixedVariableSplit(0, 0).fixedShare).toBe(0);
  });
});

describe("fixedVariableFromInsights", () => {
  const insights = [
    { categoryId: "a", total: 600 },
    { categoryId: "b", total: 300 },
    { categoryId: "c", total: 100 },
  ];
  it("sums fixed vs variable by the fixed-category set", () => {
    const r = fixedVariableFromInsights(insights, new Set(["a", "c"]));
    expect(r.fixe).toBe(700);
    expect(r.variable).toBe(300);
    expect(r.fixedShare).toBeCloseTo(0.7);
  });
  it("empty fixed set → all variable, share 0", () => {
    const r = fixedVariableFromInsights(insights, new Set());
    expect(r.fixe).toBe(0);
    expect(r.fixedShare).toBe(0);
  });
  it("no insights → zeros", () => {
    expect(fixedVariableFromInsights([], new Set(["a"]))).toEqual({
      fixe: 0,
      variable: 0,
      fixedShare: 0,
    });
  });
});
