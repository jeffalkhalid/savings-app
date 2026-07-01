import { describe, it, expect } from "vitest";
import { budgetsToMap } from "./budgets";

describe("budgetsToMap", () => {
  it("maps rows by category id", () => {
    expect(
      budgetsToMap([
        { category_id: "a", monthly_budget: 100 },
        { category_id: "b", monthly_budget: 50 },
      ])
    ).toEqual({ a: 100, b: 50 });
  });
  it("returns empty for no rows", () => {
    expect(budgetsToMap([])).toEqual({});
  });
  it("coerces numeric strings", () => {
    expect(
      budgetsToMap([
        { category_id: "a", monthly_budget: "80" as unknown as number },
      ])
    ).toEqual({ a: 80 });
  });
});
