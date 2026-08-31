import { describe, it, expect } from "vitest";
import { buildHistoryMap, classifyRows } from "./classify";
import type { ParsedRow } from "./bnp-import";
import type { Txn } from "./types";

const row = (p: Partial<ParsedRow>): ParsedRow => ({
  date: "2025-08-07",
  label: "FACTURE CARTE DU 050825 ELIOR ENTRETRIS CARTE   4974XXXXXXXX4402",
  amount: -20,
  bnpCategory: "",
  bnpSubCategory: "",
  shortLabel: "PAIEMENT CB",
  operationType: "FACTURE CARTE",
  ...p,
});

const emptyCtx = {
  rulesByKey: new Map<string, string>(),
  categoryNameById: new Map<string, string>(),
  historyByKey: new Map<string, string>(),
};

describe("buildHistoryMap", () => {
  it("associe une clé commerçant à la catégorie majoritaire", () => {
    const txns: Txn[] = [
      { id: "1", date: "2025-01-01", amount: -10, description: "FACTURE CARTE DU 010125 ELIOR ENTRETRIS CARTE 4974", type: "expense", category_id: "resto" },
      { id: "2", date: "2025-02-01", amount: -12, description: "FACTURE CARTE DU 010225 ELIOR ENTRETRIS CARTE 4974", type: "expense", category_id: "resto" },
      { id: "3", date: "2025-03-01", amount: -14, description: "FACTURE CARTE DU 010325 ELIOR ENTRETRIS CARTE 4974", type: "expense", category_id: "courses" },
    ];
    const names = new Map([["resto", "Restaurants & Sorties"], ["courses", "Courses alimentaires"]]);
    const map = buildHistoryMap(txns, names);
    expect(map.get("elior entretris")).toBe("Restaurants & Sorties");
  });

  it("ignore les transactions sans catégorie", () => {
    const txns: Txn[] = [
      { id: "1", date: "2025-01-01", amount: -10, description: "X", type: "expense", category_id: null },
    ];
    expect(buildHistoryMap(txns, new Map()).size).toBe(0);
  });
});

describe("classifyRows — priorité de la cascade", () => {
  it("1. une règle explicite gagne sur tout le reste", () => {
    const [r] = classifyRows([row({ bnpCategory: "Revenus" })], {
      ...emptyCtx,
      rulesByKey: new Map([["elior entretris", "cat-resto"]]),
      categoryNameById: new Map([["cat-resto", "Restaurants & Sorties"]]),
      historyByKey: new Map([["elior entretris", "Courses alimentaires"]]),
    });
    expect(r.categoryName).toBe("Restaurants & Sorties");
    expect(r.provenance).toBe("rule");
  });

  it("2. l'historique gagne sur les catégories BNP", () => {
    const [r] = classifyRows([row({ bnpCategory: "Revenus" })], {
      ...emptyCtx,
      historyByKey: new Map([["elior entretris", "Restaurants & Sorties"]]),
    });
    expect(r.categoryName).toBe("Restaurants & Sorties");
    expect(r.provenance).toBe("history");
  });

  it("3. les catégories BNP servent quand l'export les fournit", () => {
    const [r] = classifyRows(
      [row({ bnpCategory: "Revenus", bnpSubCategory: "Salaire" })],
      emptyCtx
    );
    expect(r.categoryName).toBe("Salaire");
    expect(r.provenance).toBe("bnp");
  });

  it("4. un virement passe par classifyTransfer", () => {
    const [r] = classifyRows(
      [
        row({
          label: "VIR SEPA INST EMIS /MOTIF EPARGNE /BEN LIVRET A",
          operationType: "VIR SEPA INST EMIS",
          amount: -500,
        }),
      ],
      emptyCtx
    );
    expect(r.provenance).toBe("transfer");
  });

  it("5. sinon, devinette timide : COMMISSIONS en Frais bancaires", () => {
    const [r] = classifyRows(
      [row({ label: "COMMISSIONS COTISATION", operationType: "COMMISSIONS", shortLabel: "COMMISSIONS" })],
      emptyCtx
    );
    expect(r.categoryName).toBe("Frais bancaires");
    expect(r.provenance).toBe("guess");
  });

  it("5. tout le reste tombe en Autres, jamais en Courses alimentaires", () => {
    const [r] = classifyRows([row({})], emptyCtx);
    expect(r.categoryName).toBe("Autres");
    expect(r.provenance).toBe("guess");
  });

  it("expose la clé commerçant de chaque ligne", () => {
    const [r] = classifyRows([row({})], emptyCtx);
    expect(r.payeeKey).toBe("elior entretris");
  });

  it("ignore une règle pointant vers une catégorie inconnue", () => {
    const [r] = classifyRows([row({})], {
      ...emptyCtx,
      rulesByKey: new Map([["elior entretris", "cat-supprimee"]]),
    });
    expect(r.provenance).toBe("guess");
    expect(r.categoryName).toBe("Autres");
  });
});
