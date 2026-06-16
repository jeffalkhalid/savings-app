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
