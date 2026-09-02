import { describe, it, expect } from "vitest";
import { merchantDrifts } from "./drift";
import type { Txn } from "./types";

let seq = 0;
const t = (date: string, amount: number, description = "NETFLIX"): Txn => ({
  id: `t${seq++}`,
  date,
  amount: -amount,
  description,
  type: "expense",
});

/** Une opération par mois, montants donnés dans l'ordre des mois. */
const monthly = (
  months: string[],
  amounts: number[],
  description = "NETFLIX"
): Txn[] => months.map((m, i) => t(`${m}-05`, amounts[i], description));

const TODAY = "2026-08-15";

describe("merchantDrifts", () => {
  it("retient une hausse régulière et en chiffre l'impact annuel", () => {
    // 6 mois, +2 € par mois : pente 2, ajustement parfait, 24 €/an.
    const out = merchantDrifts(
      monthly(
        ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"],
        [100, 102, 104, 106, 108, 110]
      ),
      TODAY
    );
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe("netflix");
    expect(out[0].monthsSeen).toBe(6);
    expect(out[0].slope).toBeCloseTo(2);
    expect(out[0].r2).toBeCloseTo(1);
    expect(out[0].annualImpact).toBeCloseTo(24);
    // Médiane des 3 derniers mois observés : 106, 108, 110.
    expect(out[0].recent).toBeCloseTo(108);
  });

  it("écarte une série plate", () => {
    const out = merchantDrifts(
      monthly(
        ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"],
        [50, 50, 50, 50, 50, 50]
      ),
      TODAY
    );
    expect(out).toEqual([]);
  });

  it("écarte un poste variable : grosse pente, ajustement nul", () => {
    // Pente ≈ 31,7 €/mois, soit 380 €/an — largement au-dessus du seuil
    // d'impact. C'est le R² (≈ 0,15) qui l'élimine, et c'est tout l'intérêt
    // de ce garde-fou : sans lui, les courses satureraient la liste.
    const out = merchantDrifts(
      monthly(
        ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"],
        [100, 400, 120, 380, 150, 420],
        "CARREFOUR"
      ),
      TODAY
    );
    expect(out).toEqual([]);
  });

  it("écarte une hausse nette observée sur moins de 5 mois", () => {
    const out = merchantDrifts(
      monthly(["2026-03", "2026-04", "2026-05", "2026-06"], [100, 110, 120, 130]),
      TODAY
    );
    expect(out).toEqual([]);
  });

  it("retient la même hausse dès le cinquième mois", () => {
    const out = merchantDrifts(
      monthly(
        ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07"],
        [100, 110, 120, 130, 140]
      ),
      TODAY
    );
    expect(out).toHaveLength(1);
    expect(out[0].monthsSeen).toBe(5);
    expect(out[0].slope).toBeCloseTo(10);
    expect(out[0].recent).toBeCloseTo(130);
  });

  it("écarte une hausse trop petite pour appeler une action", () => {
    // +1,50 €/mois → 18 €/an, sous le seuil de 20 €, malgré un ajustement
    // parfait.
    const out = merchantDrifts(
      monthly(
        ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"],
        [100, 101.5, 103, 104.5, 106, 107.5]
      ),
      TODAY
    );
    expect(out).toEqual([]);
  });

  it("exclut le mois en cours, partiel par nature", () => {
    // Le mois d'août est en cours : l'abonnement n'y a été prélevé qu'en
    // partie. S'il comptait, la pente s'effondrerait et la ligne
    // disparaîtrait — c'est exactement ce que le test interdit.
    const out = merchantDrifts(
      [
        ...monthly(
          ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07"],
          [100, 110, 120, 130, 140]
        ),
        t("2026-08-02", 5),
      ],
      TODAY
    );
    expect(out).toHaveLength(1);
    expect(out[0].monthsSeen).toBe(5);
    expect(out[0].slope).toBeCloseTo(10);
  });

  it("compte les mois calendaires, pas les points observés", () => {
    // Quatre mois consécutifs puis un trou de quatre mois. Sur un axe en
    // rang, la pente vaudrait 18 ; sur l'axe calendaire, les cinq points
    // sont exactement alignés sur +10 €/mois.
    const out = merchantDrifts(
      monthly(
        ["2026-01", "2026-02", "2026-03", "2026-04", "2026-09"],
        [100, 110, 120, 130, 180]
      ),
      "2026-10-15"
    );
    expect(out).toHaveLength(1);
    expect(out[0].slope).toBeCloseTo(10);
    expect(out[0].r2).toBeCloseTo(1);
  });

  it("prend pour montant récent la médiane des 3 derniers mois, pas la droite", () => {
    // Derniers mois observés : 16, 18, 40 → médiane 18. La droite prédirait
    // ≈ 34 au dernier mois et le dernier relevé vaut 40 : un montant attendu
    // doit être un nombre qui s'est produit, pas une sortie de modèle.
    const out = merchantDrifts(
      monthly(
        ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"],
        [10, 12, 14, 16, 18, 40]
      ),
      TODAY
    );
    expect(out).toHaveLength(1);
    expect(out[0].recent).toBeCloseTo(18);
  });

  it("classe par impact annuel décroissant", () => {
    const out = merchantDrifts(
      [
        ...monthly(
          ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"],
          [100, 102, 104, 106, 108, 110],
          "NETFLIX"
        ),
        ...monthly(
          ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"],
          [200, 210, 220, 230, 240, 250],
          "ASSURANCE AUTO"
        ),
      ],
      TODAY
    );
    expect(out.map((d) => d.key)).toEqual(["assurance auto", "netflix"]);
    expect(out[0].annualImpact).toBeGreaterThan(out[1].annualImpact);
  });

  it("ignore tout ce qui n'est pas une dépense", () => {
    const rising = monthly(
      ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"],
      [100, 110, 120, 130, 140, 150],
      "SALAIRE"
    ).map((x) => ({ ...x, type: "income" as const, amount: -x.amount }));
    expect(merchantDrifts(rising, TODAY)).toEqual([]);
  });

  it("ne bronche pas sur un commerçant vu dans un seul mois", () => {
    // Toutes les opérations dans le même mois : une série d'un point, sur
    // laquelle aucune pente n'est calculable. Doit être écartée sans NaN ni
    // exception.
    const out = merchantDrifts(
      [t("2026-05-02", 20), t("2026-05-12", 30), t("2026-05-22", 25)],
      TODAY
    );
    expect(out).toEqual([]);
  });

  it("rend une liste vide pour une entrée vide", () => {
    expect(merchantDrifts([], TODAY)).toEqual([]);
  });
});
