import { describe, it, expect } from "vitest";
import { fixedVariableFromInsights } from "./fixed";

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
