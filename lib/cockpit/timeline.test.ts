import { describe, it, expect } from "vitest";
import {
  monthlyTotals,
  monthlyByCategory,
  topCategories,
  withoutCurrentMonth,
} from "./timeline";
import { DEFAULT_SHIFT } from "./budget-month";
import { computeMetrics } from "./metrics";
import type { Txn } from "./types";

const t = (
  id: string,
  date: string,
  amount: number,
  type: Txn["type"],
  category_id: string | null = null
): Txn => ({ id, date, amount, description: `op ${id}`, type, category_id });

describe("monthlyTotals", () => {
  it("regroupe par mois et somme par type, en valeur absolue", () => {
    const out = monthlyTotals(
      [
        t("1", "2026-08-05", 3000, "income"),
        t("2", "2026-08-10", -200, "expense"),
        t("3", "2026-08-15", -50, "expense"),
        t("4", "2026-08-20", -500, "savings"),
      ],
      DEFAULT_SHIFT
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      month: "2026-08",
      revenus: 3000,
      depenses: 250,
      epargne: 500,
    });
  });

  it("exclut les virements des trois séries", () => {
    const out = monthlyTotals(
      [
        t("1", "2026-08-05", 3000, "income"),
        t("2", "2026-08-06", -900, "transfer"),
      ],
      DEFAULT_SHIFT
    );
    expect(out[0].revenus).toBe(3000);
    expect(out[0].depenses).toBe(0);
    expect(out[0].epargne).toBe(0);
  });

  it("calcule le taux d'épargne comme computeMetrics", () => {
    const [r] = monthlyTotals(
      [
        t("1", "2026-08-05", 2000, "income"),
        t("2", "2026-08-20", -500, "savings"),
      ],
      DEFAULT_SHIFT
    );
    expect(r.tauxEpargne).toBeCloseTo(0.25);
  });

  it("met le taux d'épargne à 0 quand les revenus sont nuls", () => {
    const [r] = monthlyTotals(
      [t("1", "2026-08-20", -500, "savings")],
      DEFAULT_SHIFT
    );
    expect(r.tauxEpargne).toBe(0);
  });

  it("donne les mêmes chiffres que computeMetrics pour un mois", () => {
    const month = [
      t("1", "2026-08-05", 3000, "income"),
      t("2", "2026-08-10", -200, "expense"),
      t("3", "2026-08-20", -500, "savings"),
      t("4", "2026-08-21", -100, "transfer"),
    ];
    const [série] = monthlyTotals(month, DEFAULT_SHIFT);
    const m = computeMetrics(month);
    expect(série.revenus).toBeCloseTo(m.revenus);
    expect(série.depenses).toBeCloseTo(m.depenses);
    expect(série.epargne).toBeCloseTo(m.epargne);
    expect(série.tauxEpargne).toBeCloseTo(m.tauxEpargne);
  });

  it("rend les mois par ordre croissant", () => {
    const out = monthlyTotals(
      [
        t("1", "2026-09-05", -10, "expense"),
        t("2", "2026-07-05", -10, "expense"),
        t("3", "2026-08-05", -10, "expense"),
      ],
      DEFAULT_SHIFT
    );
    expect(out.map((m) => m.month)).toEqual(["2026-07", "2026-08", "2026-09"]);
  });

  it("n'invente pas les mois sans transaction", () => {
    const out = monthlyTotals(
      [
        t("1", "2026-07-05", -10, "expense"),
        t("2", "2026-09-05", -10, "expense"),
      ],
      DEFAULT_SHIFT
    );
    expect(out.map((m) => m.month)).toEqual(["2026-07", "2026-09"]);
  });

  it("passe l'année", () => {
    const out = monthlyTotals(
      [
        t("1", "2026-12-05", -10, "expense"),
        t("2", "2027-01-05", -10, "expense"),
      ],
      DEFAULT_SHIFT
    );
    expect(out.map((m) => m.month)).toEqual(["2026-12", "2027-01"]);
  });

  it("range une opération rattachée dans le mois suivant", () => {
    // C'est le lien avec le Cockpit que toute la conception cherche à préserver.
    const shift = {
      payeeKeys: ["carrefour france"],
      categoryIds: ["cat-salaire"],
      days: 4,
    };
    const salaire: Txn = {
      id: "s",
      date: "2026-08-29",
      amount: 3000,
      description:
        "VIR SEPA RECU /DE CARREFOUR FRANCE /MOTIF  /REF CARREFOUR 196187027523717",
      type: "income",
      category_id: "cat-salaire",
    };
    const out = monthlyTotals([salaire], shift);
    expect(out).toEqual([
      { month: "2026-09", revenus: 3000, depenses: 0, epargne: 0, tauxEpargne: 0 },
    ]);
  });

  it("rend une liste vide pour une entrée vide", () => {
    expect(monthlyTotals([], DEFAULT_SHIFT)).toEqual([]);
  });
});

describe("monthlyByCategory", () => {
  it("ne renvoie que les catégories demandées", () => {
    const out = monthlyByCategory(
      [
        t("1", "2026-08-05", -100, "expense", "a"),
        t("2", "2026-08-06", -50, "expense", "b"),
      ],
      DEFAULT_SHIFT,
      ["a"]
    );
    expect(out).toEqual([{ month: "2026-08", totals: { a: 100 } }]);
  });

  it("met une catégorie sans opération à 0 dans un mois qui existe", () => {
    const out = monthlyByCategory(
      [
        t("1", "2026-08-05", -100, "expense", "a"),
        t("2", "2026-09-05", -70, "expense", "b"),
      ],
      DEFAULT_SHIFT,
      ["a", "b"]
    );
    expect(out).toEqual([
      { month: "2026-08", totals: { a: 100, b: 0 } },
      { month: "2026-09", totals: { a: 0, b: 70 } },
    ]);
  });

  it("rend une liste vide quand aucune catégorie n'est demandée", () => {
    const out = monthlyByCategory(
      [t("1", "2026-08-05", -100, "expense", "a")],
      DEFAULT_SHIFT,
      []
    );
    expect(out).toEqual([]);
  });
});

describe("topCategories", () => {
  it("classe par dépense cumulée décroissante", () => {
    const out = topCategories(
      [
        t("1", "2026-08-05", -10, "expense", "petite"),
        t("2", "2026-08-06", -300, "expense", "grosse"),
        t("3", "2026-09-06", -100, "expense", "moyenne"),
      ],
      3
    );
    expect(out).toEqual(["grosse", "moyenne", "petite"]);
  });

  it("respecte n", () => {
    const out = topCategories(
      [
        t("1", "2026-08-05", -10, "expense", "a"),
        t("2", "2026-08-06", -300, "expense", "b"),
        t("3", "2026-08-07", -100, "expense", "c"),
      ],
      2
    );
    expect(out).toEqual(["b", "c"]);
  });

  it("rend moins de n quand il y a moins de catégories", () => {
    expect(
      topCategories([t("1", "2026-08-05", -10, "expense", "a")], 5)
    ).toEqual(["a"]);
  });

  it("ignore les opérations sans catégorie et les non-dépenses", () => {
    const out = topCategories(
      [
        t("1", "2026-08-05", -10, "expense", null),
        t("2", "2026-08-06", 3000, "income", "salaire"),
        t("3", "2026-08-07", -40, "expense", "courses"),
      ],
      5
    );
    expect(out).toEqual(["courses"]);
  });
});

describe("withoutCurrentMonth", () => {
  it("retire le mois en cours, qui n'est pas terminé", () => {
    const série = [
      { month: "2026-07", v: 1 },
      { month: "2026-08", v: 2 },
      { month: "2026-09", v: 3 },
    ];
    expect(withoutCurrentMonth(série, "2026-09")).toEqual([
      { month: "2026-07", v: 1 },
      { month: "2026-08", v: 2 },
    ]);
  });

  it("ne retire rien si le mois en cours n'est pas dans la série", () => {
    const série = [{ month: "2026-07", v: 1 }];
    expect(withoutCurrentMonth(série, "2026-09")).toEqual(série);
  });

  it("ne retire que le mois en cours, pas les mois postérieurs", () => {
    // Une opération peut être datée dans le futur (virement programmé).
    const série = [
      { month: "2026-09", v: 1 },
      { month: "2026-10", v: 2 },
    ];
    expect(withoutCurrentMonth(série, "2026-09")).toEqual([
      { month: "2026-10", v: 2 },
    ]);
  });

  it("rend une liste vide pour une entrée vide", () => {
    expect(withoutCurrentMonth([], "2026-09")).toEqual([]);
  });
});
