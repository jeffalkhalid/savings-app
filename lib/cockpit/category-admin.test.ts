import { describe, it, expect } from "vitest";
import {
  CATEGORY_COLORS,
  CAT_TYPE_ORDER,
  categoryNameError,
  splitCategories,
} from "./category-admin";

describe("categoryNameError", () => {
  it("requires a name", () => {
    expect(categoryNameError("  ", [])).toBe("Nom requis");
  });
  it("rejects a duplicate (case/accent-insensitive)", () => {
    expect(categoryNameError("Énergie", ["energie"])).toBe("Ce nom existe déjà");
  });
  it("accepts a fresh name", () => {
    expect(categoryNameError("Voyages", ["Énergie", "Loisirs"])).toBeNull();
  });
});

describe("palette + types", () => {
  it("has hex colors", () => {
    expect(CATEGORY_COLORS.length).toBeGreaterThan(0);
    for (const c of CATEGORY_COLORS) expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
  it("orders all 4 types", () => {
    expect(new Set(CAT_TYPE_ORDER).size).toBe(4);
  });
});

describe("splitCategories", () => {
  const cats = [
    { id: "1", user_id: null },
    { id: "2", user_id: "me" },
    { id: "3", user_id: "other" },
  ];
  it("separates common (null) and mine, ignoring other users", () => {
    const { common, mine } = splitCategories(cats, "me");
    expect(common.map((c) => c.id)).toEqual(["1"]);
    expect(mine.map((c) => c.id)).toEqual(["2"]);
  });
});
