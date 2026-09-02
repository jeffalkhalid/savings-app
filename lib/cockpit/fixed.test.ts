import { describe, it, expect } from "vitest";
import { fixedVariableFromInsights, nonFixedExpenseTotal } from "./fixed";
import type { Txn } from "./types";

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

describe("nonFixedExpenseTotal", () => {
  const txn = (over: Partial<Txn>): Txn => ({
    id: "id",
    date: "2026-08-15",
    amount: 0,
    description: "",
    type: "expense",
    category_id: null,
    account_id: null,
    goal_id: null,
    ...over,
  });

  it("exclut une catégorie fixe", () => {
    const total = nonFixedExpenseTotal(
      [txn({ amount: 800, category_id: "rent" })],
      new Set(["rent"])
    );
    expect(total).toBe(0);
  });

  it("inclut une catégorie non fixe", () => {
    const total = nonFixedExpenseTotal(
      [txn({ amount: 400, category_id: "groceries" })],
      new Set(["rent"])
    );
    expect(total).toBe(400);
  });

  it("inclut une transaction sans catégorie", () => {
    const total = nonFixedExpenseTotal(
      [txn({ amount: 200, category_id: null })],
      new Set(["rent"])
    );
    expect(total).toBe(200);
  });

  it("ignore les types autres que dépense", () => {
    const total = nonFixedExpenseTotal(
      [
        txn({ amount: 1000, type: "income", category_id: "groceries" }),
        txn({ amount: 300, type: "savings", category_id: "groceries" }),
        txn({ amount: 50, type: "transfer", category_id: "groceries" }),
      ],
      new Set(["rent"])
    );
    expect(total).toBe(0);
  });

  it("aucune transaction → 0", () => {
    expect(nonFixedExpenseTotal([], new Set(["rent"]))).toBe(0);
  });

  it("prend la valeur absolue du montant", () => {
    const total = nonFixedExpenseTotal(
      [txn({ amount: -150, category_id: "groceries" })],
      new Set(["rent"])
    );
    expect(total).toBe(150);
  });
});
