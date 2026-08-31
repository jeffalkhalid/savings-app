import { describe, it, expect } from "vitest";
import {
  applyCategoryToSelection,
  rulesFromSelection,
  bulkSummary,
} from "./bulk-select";

const rows = [
  { payeeKey: "elior entretris", categoryName: "Autres" },
  { payeeKey: "uber trip", categoryName: "Autres" },
  { payeeKey: "elior entretris", categoryName: "Autres" },
  { payeeKey: "carrefour banque", categoryName: "Courses alimentaires" },
];

describe("applyCategoryToSelection", () => {
  it("ne change que les lignes sélectionnées", () => {
    const out = applyCategoryToSelection(rows, new Set([0, 1]), "Restaurants & Sorties");
    expect(out[0].categoryName).toBe("Restaurants & Sorties");
    expect(out[1].categoryName).toBe("Restaurants & Sorties");
    expect(out[2].categoryName).toBe("Autres");
    expect(out[3].categoryName).toBe("Courses alimentaires");
  });

  it("ne mute pas le tableau d'origine", () => {
    applyCategoryToSelection(rows, new Set([0]), "X");
    expect(rows[0].categoryName).toBe("Autres");
  });

  it("une sélection vide ne change rien", () => {
    expect(applyCategoryToSelection(rows, new Set(), "X")).toEqual(rows);
  });
});

describe("rulesFromSelection", () => {
  it("produit une règle par commerçant distinct", () => {
    const out = rulesFromSelection(rows, new Set([0, 1, 2]), "cat-1");
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.payeeKey).sort()).toEqual(["elior entretris", "uber trip"]);
    expect(out.every((r) => r.categoryId === "cat-1")).toBe(true);
  });

  it("ignore les clés vides", () => {
    const out = rulesFromSelection([{ payeeKey: "" }], new Set([0]), "cat-1");
    expect(out).toEqual([]);
  });

  it("une sélection vide ne produit aucune règle", () => {
    expect(rulesFromSelection(rows, new Set(), "cat-1")).toEqual([]);
  });
});

describe("bulkSummary", () => {
  it("annonce lignes et règles au pluriel", () => {
    expect(bulkSummary(47, 12, "Restaurants & Sorties")).toBe(
      "47 lignes classées en Restaurants & Sorties, 12 règles créées"
    );
  });
  it("gère le singulier", () => {
    expect(bulkSummary(1, 1, "Autres")).toBe(
      "1 ligne classée en Autres, 1 règle créée"
    );
  });
});
