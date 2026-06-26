import { describe, it, expect } from "vitest";
import { categoryIcon } from "./category-icon";
import { ShoppingCart, TrendingUp, Home, Zap, CreditCard } from "lucide-react";

describe("categoryIcon", () => {
  it("maps known categories to lucide icons", () => {
    expect(categoryIcon("Courses alimentaires")).toBe(ShoppingCart);
    expect(categoryIcon("Bourse / Natixis")).toBe(TrendingUp);
    expect(categoryIcon("Logement")).toBe(Home);
  });
  it("is case- and accent-insensitive", () => {
    expect(categoryIcon("ÉNERGIE")).toBe(Zap);
  });
  it("falls back to a default", () => {
    expect(categoryIcon("Truc inconnu")).toBe(CreditCard);
  });
});
