import { describe, it, expect } from "vitest";
import { analyzeCategories } from "./categories-analysis";
import type { MonthlyCategoryRow } from "./categories-analysis";
import type { Category } from "./types";

const cats: Category[] = [
  { id: "c1", name: "Courses", type: "expense", color: "" },
  { id: "c2", name: "Resto", type: "expense", color: "" },
  { id: "c3", name: "Salaire", type: "income", color: "" },
];
const row = (
  year_month: string,
  category_id: string,
  type: string,
  total_abs: number,
  n_txns = 1
): MonthlyCategoryRow => ({ year_month, category_id, type, n_txns, total_abs });

describe("analyzeCategories", () => {
  it("ranks current-month expenses by total desc with share", () => {
    const out = analyzeCategories(
      [row("2026-05", "c1", "expense", 800), row("2026-05", "c2", "expense", 200)],
      "2026-05",
      cats
    );
    expect(out.map((i) => i.categoryId)).toEqual(["c1", "c2"]);
    expect(out[0].share).toBeCloseTo(0.8);
    expect(out[1].share).toBeCloseTo(0.2);
    expect(out[0].name).toBe("Courses");
  });

  it("computes deltaPct vs the mean of prior months", () => {
    const out = analyzeCategories(
      [
        row("2026-03", "c1", "expense", 100),
        row("2026-04", "c1", "expense", 100),
        row("2026-05", "c1", "expense", 120),
      ],
      "2026-05",
      cats
    );
    expect(out[0].avgPrior).toBeCloseTo(100);
    expect(out[0].deltaPct).toBeCloseTo(0.2);
  });

  it("marks a category with no prior month as nouveau (deltaPct null)", () => {
    const out = analyzeCategories([row("2026-05", "c1", "expense", 50)], "2026-05", cats);
    expect(out[0].deltaPct).toBeNull();
    expect(out[0].avgPrior).toBe(0);
  });

  it("ignores non-expense rows", () => {
    const out = analyzeCategories(
      [row("2026-05", "c1", "expense", 100), row("2026-05", "c3", "income", 3000)],
      "2026-05",
      cats
    );
    expect(out).toHaveLength(1);
    expect(out[0].categoryId).toBe("c1");
  });

  it("falls back to the category id when the name is unknown", () => {
    const out = analyzeCategories([row("2026-05", "cX", "expense", 10)], "2026-05", cats);
    expect(out[0].name).toBe("cX");
  });
});
