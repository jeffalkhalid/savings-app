import { describe, it, expect } from "vitest";
import { assetIcon } from "./asset-icon";
import { TrendingUp, PiggyBank, Banknote, Coins, CreditCard } from "lucide-react";

describe("assetIcon", () => {
  it("maps asset types to lucide icons", () => {
    expect(assetIcon("stock")).toBe(TrendingUp);
    expect(assetIcon("savings")).toBe(PiggyBank);
    expect(assetIcon("cash")).toBe(Banknote);
    expect(assetIcon("commodity")).toBe(Coins);
  });
  it("is case-insensitive and falls back", () => {
    expect(assetIcon("STOCK")).toBe(TrendingUp);
    expect(assetIcon("inconnu")).toBe(CreditCard);
  });
});
