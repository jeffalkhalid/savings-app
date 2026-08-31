import { describe, it, expect } from "vitest";
import {
  parseBnpSheet,
  mapBnpCategory,
  rowKey,
  markDuplicates,
} from "./bnp-import";

const sheet: string[][] = [
  ["Compte de chèques ****8172", "Solde au 15/06/2026", "3614.49", "EUR", "", "", ""],
  [],
  [
    "Date operation",
    "Categorie operation",
    "Sous Categorie operation",
    "Libelle operation",
    "Montant operation",
    "Pointage operation",
    "Commentaire operation",
  ],
  ["12-06-2026", "À catégoriser", "Virement émis", "VIREMENT EMIS", "-300", "", ""],
  ["12-06-2026", "Loisirs et Sorties", "Sport", "CB INTERSPORT", "-149,99", "", ""],
  ["bad-row"],
];

describe("parseBnpSheet", () => {
  it("skips the account header and parses data rows", () => {
    expect(parseBnpSheet(sheet)).toHaveLength(2);
  });
  it("converts date to ISO and amount to a signed number", () => {
    const [first, second] = parseBnpSheet(sheet);
    expect(first).toEqual({
      date: "2026-06-12",
      label: "VIREMENT EMIS",
      amount: -300,
      bnpCategory: "À catégoriser",
      bnpSubCategory: "Virement émis",
      shortLabel: "",
      operationType: "",
    });
    expect(second.amount).toBeCloseTo(-149.99);
  });
  it("returns [] when no header row is present", () => {
    expect(parseBnpSheet([["x", "y"]])).toEqual([]);
  });
});

describe("mapBnpCategory", () => {
  it("maps by sub-category first", () => {
    expect(mapBnpCategory("À catégoriser", "Virement émis")).toBe("Virements");
    expect(mapBnpCategory("Loisirs et Sorties", "Sport")).toBe("Sport & Bien-être");
  });
  it("falls back to the category", () => {
    expect(mapBnpCategory("Revenus", "Inconnu")).toBe("Salaire");
  });
  it("defaults to Imprévus & Santé when nothing matches", () => {
    expect(mapBnpCategory("Zzz", "Yyy")).toBe("Imprévus & Santé");
  });
});

describe("rowKey / markDuplicates", () => {
  it("builds a date|amount key", () => {
    expect(rowKey("2026-06-12", -300)).toBe("2026-06-12|-300");
  });
  it("flags rows already present and applies the mapping", () => {
    const parsed = parseBnpSheet(sheet);
    const existing = new Set(["2026-06-12|-300"]);
    const reviewed = markDuplicates(parsed, existing);
    expect(reviewed[0].duplicate).toBe(true);
    expect(reviewed[0].categoryName).toBe("Virements");
    expect(reviewed[1].duplicate).toBe(false);
    expect(reviewed[1].categoryName).toBe("Sport & Bien-être");
  });
});

const sheet13Mois: string[][] = [
  ["Compte de chèques", "Compte de chèques", "****8172", "28/08/2026", "", "3546.30"],
  ["", "", "", "", "", ""],
  [
    "Date operation",
    "Libelle court",
    "Type operation",
    "Libelle operation",
    "Montant operation en euro",
    "",
  ],
  [
    "07/08/2025",
    "PAIEMENT CB",
    "FACTURE CARTE",
    "FACTURE CARTE DU 050825 ELIOR ENTRETRIS CARTE   4974XXXXXXXX4402                FRA    20,00EUR",
    "-20.00",
    "",
  ],
  [
    "08/08/2025",
    "PRELEVEMENT",
    "PRLV SEPA",
    "PRLV SEPA CARREFOUR BANQUE ECH/080825 ID EMETTEUR/FR83ZZZ135674 MDT/CS00-51272097231100 REF/X LIB/Y",
    "-22.41",
    "",
  ],
];

describe("parseBnpSheet — export 13 mois", () => {
  it("parse les dates à slashes", () => {
    const rows = parseBnpSheet(sheet13Mois);
    expect(rows).toHaveLength(2);
    expect(rows[0].date).toBe("2025-08-07");
  });

  it("lit le libellé et le montant par nom de colonne", () => {
    const [first] = parseBnpSheet(sheet13Mois);
    expect(first.label).toContain("ELIOR ENTRETRIS");
    expect(first.amount).toBeCloseTo(-20);
  });

  it("remplit shortLabel et operationType", () => {
    const [first] = parseBnpSheet(sheet13Mois);
    expect(first.shortLabel).toBe("PAIEMENT CB");
    expect(first.operationType).toBe("FACTURE CARTE");
  });

  it("laisse les catégories BNP vides quand l'export ne les fournit pas", () => {
    const [first] = parseBnpSheet(sheet13Mois);
    expect(first.bnpCategory).toBe("");
    expect(first.bnpSubCategory).toBe("");
  });

  it("renvoie [] si une colonne obligatoire manque", () => {
    const sansMontant = [
      ["Date operation", "Libelle operation"],
      ["07/08/2025", "X"],
    ];
    expect(parseBnpSheet(sansMontant)).toEqual([]);
  });

  it("ne dépend pas de l'ordre des colonnes", () => {
    const inverse: string[][] = [
      ["Montant operation en euro", "Libelle operation", "Date operation"],
      ["-20.00", "FACTURE CARTE DU 050825 ELIOR ENTRETRIS CARTE 4974", "07/08/2025"],
    ];
    const rows = parseBnpSheet(inverse);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBeCloseTo(-20);
    expect(rows[0].date).toBe("2025-08-07");
  });
});

describe("parseBnpSheet — l'ancien format reste supporté", () => {
  it("remplit shortLabel et operationType avec des chaînes vides", () => {
    const [first] = parseBnpSheet(sheet);
    expect(first.shortLabel).toBe("");
    expect(first.operationType).toBe("");
    expect(first.bnpCategory).toBe("À catégoriser");
  });
});
