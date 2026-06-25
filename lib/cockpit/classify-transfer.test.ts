import { describe, it, expect } from "vitest";
import { classifyTransfer, targetCategoryName } from "./classify-transfer";

describe("classifyTransfer", () => {
  it("treats a received transfer (>= 0) as income", () => {
    expect(classifyTransfer(200, "VIREMENT RECU DE YASMIN")).toBe("income");
    expect(classifyTransfer(0, "x")).toBe("income");
  });
  it("treats a generic sent transfer as expense", () => {
    expect(classifyTransfer(-300, "VIREMENT EMIS VERS KHALID")).toBe("expense");
  });
  it("treats a sent transfer toward a savings/invest account as savings", () => {
    expect(classifyTransfer(-1000, "VIREMENT VERS NATIXIS")).toBe("savings");
    expect(classifyTransfer(-500, "Virement Bourse")).toBe("savings");
    expect(classifyTransfer(-500, "VIR PEA")).toBe("savings");
    expect(classifyTransfer(-200, "VIREMENT LIVRET A")).toBe("savings");
    expect(classifyTransfer(-200, "VIR LDDS")).toBe("savings");
  });
  it("is case- and accent-insensitive", () => {
    expect(classifyTransfer(-100, "virement ÉPARGNE")).toBe("savings");
    expect(classifyTransfer(-100, "VERS EPARGNE")).toBe("savings");
  });
  it("does not match a keyword inside another word (word boundary)", () => {
    expect(classifyTransfer(-50, "REMBOURSEMENT VERS DUPONT")).toBe("expense");
    expect(classifyTransfer(-30, "PEAGE AUTOROUTE A6")).toBe("expense");
  });
});

describe("targetCategoryName", () => {
  it("maps income/expense to the Virements categories", () => {
    expect(targetCategoryName("income", "x")).toBe("Virements reçus");
    expect(targetCategoryName("expense", "x")).toBe("Virements émis");
  });
  it("maps savings to Bourse / Natixis for invest labels, Épargne otherwise", () => {
    expect(targetCategoryName("savings", "VERS NATIXIS")).toBe("Bourse / Natixis");
    expect(targetCategoryName("savings", "VERS PEA")).toBe("Bourse / Natixis");
    expect(targetCategoryName("savings", "VIREMENT LIVRET A")).toBe("Épargne");
  });
});
