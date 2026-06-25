import { describe, it, expect } from "vitest";
import { categoryIcon } from "./category-icon";

describe("categoryIcon", () => {
  it("maps known categories", () => {
    expect(categoryIcon("Courses alimentaires")).toBe("🛒");
    expect(categoryIcon("Bourse / Natixis")).toBe("📈");
    expect(categoryIcon("Logement")).toBe("🏠");
  });
  it("is case- and accent-insensitive", () => {
    expect(categoryIcon("ÉNERGIE")).toBe("⚡");
  });
  it("falls back to a default", () => {
    expect(categoryIcon("Truc inconnu")).toBe("💳");
  });
});
