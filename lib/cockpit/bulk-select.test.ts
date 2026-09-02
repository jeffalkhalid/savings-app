import { describe, it, expect } from "vitest";
import {
  applyCategoryToSelection,
  rulesFromSelection,
  rulesFromTxns,
  bulkSummary,
  deletionTotals,
  deleteSummary,
} from "./bulk-select";
import type { Txn } from "./types";

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

describe("rulesFromTxns", () => {
  const t = (id: string, description: string): Txn => ({
    id,
    date: "2026-08-01",
    amount: -20,
    description,
    type: "expense",
  });

  it("produit une règle par commerçant distinct", () => {
    const out = rulesFromTxns(
      [
        t("1", "PAIEMENT CB ELIOR (FRANCE) DU 28/08/26 - CARTE*4402"),
        t("2", "PAIEMENT CB ELIOR (FRANCE) DU 12/09/26 - CARTE*4402"),
        t("3", "PRELEVEMENT BOUYGUES TELECOM DU 14/08/26 - EMETTEUR : X"),
      ],
      "cat-loisirs"
    );
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.payeeKey).sort()).toEqual([
      "bouygues telecom",
      "elior france",
    ]);
    expect(out.every((r) => r.categoryId === "cat-loisirs")).toBe(true);
  });

  it("ignore les libellés qui ne produisent aucune clé", () => {
    expect(rulesFromTxns([t("1", "")], "cat-1")).toEqual([]);
  });

  it("ne produit rien pour une sélection vide", () => {
    expect(rulesFromTxns([], "cat-1")).toEqual([]);
  });
});

describe("deletionTotals", () => {
  const d = (id: string, amount: number): Txn => ({
    id,
    date: "2026-09-01",
    amount,
    description: `op ${id}`,
    type: amount < 0 ? "expense" : "income",
  });

  it("compte les lignes et somme les montants signés", () => {
    // Signé, pas en valeur absolue : la confirmation doit dire la vérité sur
    // une sélection qui mêle une dépense et un remboursement.
    const out = deletionTotals([d("1", -48.2), d("2", 30), d("3", -62.1)]);
    expect(out.count).toBe(3);
    expect(out.total).toBeCloseTo(-80.3);
  });

  it("rend un total positif quand la sélection ne contient que des revenus", () => {
    const out = deletionTotals([d("1", 100), d("2", 50)]);
    expect(out).toEqual({ count: 2, total: 150 });
  });

  it("rend zéro sur une sélection vide", () => {
    expect(deletionTotals([])).toEqual({ count: 0, total: 0 });
  });

  it("accepte un montant stocké en chaîne", () => {
    // Supabase rend les numeric en chaîne selon le pilote ; le reste du code
    // passe déjà par Number() pour cette raison.
    const rows = [{ ...d("1", 0), amount: "-12.5" as unknown as number }];
    expect(deletionTotals(rows).total).toBeCloseTo(-12.5);
  });
});

describe("deleteSummary", () => {
  it("accorde le pluriel", () => {
    expect(deleteSummary(1)).toBe("1 opération supprimée");
    expect(deleteSummary(3)).toBe("3 opérations supprimées");
  });
});
