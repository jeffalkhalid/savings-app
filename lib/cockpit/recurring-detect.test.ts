import { describe, it, expect } from "vitest";
import { normalizePayee, detectRecurring } from "./recurring-detect";
import type { Txn } from "./types";

const t = (over: Partial<Txn>): Txn => ({
  id: Math.random().toString(),
  date: "2026-06-05",
  amount: -50,
  description: "X",
  type: "expense",
  ...over,
});

describe("normalizePayee", () => {
  it("lowercases, strips accents, digits and punctuation", () => {
    expect(normalizePayee("NETFLIX 12/05 #4821")).toBe("netflix");
    expect(normalizePayee("Éléctricité EDF")).toBe("electricite edf");
  });
});

describe("detectRecurring", () => {
  const month = "2026-06";
  it("flags a payee seen in >=3 months with the median amount", () => {
    const txns: Txn[] = [
      t({ date: "2026-04-03", amount: -800, description: "PRLV LOYER 0403" }),
      t({ date: "2026-05-03", amount: -800, description: "PRLV LOYER 0503" }),
      t({ date: "2026-06-03", amount: -820, description: "PRLV LOYER 0603" }),
      t({ date: "2026-06-10", amount: -30, description: "BOULANGERIE" }),
    ];
    const out = detectRecurring(txns, month);
    // digits/dates are stripped, so the recurring key is the stable "prlv loyer".
    const loyer = out.find((c) => c.payeeKey === "prlv loyer");
    expect(loyer).toBeTruthy();
    expect(loyer!.monthsSeen).toBe(3);
    expect(loyer!.expected).toBe(800);
  });
  it("ignores a payee seen in fewer than 3 months", () => {
    const txns: Txn[] = [
      t({ date: "2026-05-03", amount: -20, description: "CAFE" }),
      t({ date: "2026-06-03", amount: -20, description: "CAFE" }),
    ];
    expect(detectRecurring(txns, month).find((c) => c.payeeKey === "cafe")).toBeUndefined();
  });
  it("excludes months outside the 6-month window", () => {
    const txns: Txn[] = [
      t({ date: "2025-01-03", amount: -800, description: "LOYER" }),
      t({ date: "2025-02-03", amount: -800, description: "LOYER" }),
      t({ date: "2025-03-03", amount: -800, description: "LOYER" }),
    ];
    expect(detectRecurring(txns, month)).toHaveLength(0);
  });
});
