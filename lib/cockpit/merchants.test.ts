import { describe, it, expect } from "vitest";
import { aggregateByMerchant, merchantSeries } from "./merchants";
import type { Txn } from "./types";

const t = (
  id: string,
  date: string,
  amount: number,
  description: string
): Txn => ({ id, date, amount, description, type: "expense" });

const ELIOR_A =
  "FACTURE CARTE DU 050825 ELIOR ENTRETRIS CARTE   4974XXXXXXXX4402                FRA    20,00EUR";
const ELIOR_B =
  "FACTURE CARTE DU 120925 ELIOR ENTRETRIS CARTE   4974XXXXXXXX4402                FRA    12,50EUR";
const UBER =
  "FACTURE CARTE DU 010825 UBER TRIP CARTE   4974XXXXXXXX4402                NLD    18,00EUR";

describe("aggregateByMerchant", () => {
  it("regroupe par commerçant et somme en valeur absolue", () => {
    const out = aggregateByMerchant([
      t("1", "2026-08-05", -20, ELIOR_A),
      t("2", "2026-09-12", -12.5, ELIOR_B),
      t("3", "2026-08-01", -18, UBER),
    ]);
    const elior = out.find((m) => m.key === "elior entretris");
    expect(elior?.total).toBeCloseTo(32.5);
    expect(elior?.count).toBe(2);
  });

  it("trie par montant cumulé décroissant", () => {
    const out = aggregateByMerchant([
      t("1", "2026-08-01", -18, UBER),
      t("2", "2026-08-05", -20, ELIOR_A),
      t("3", "2026-09-12", -12.5, ELIOR_B),
    ]);
    expect(out.map((m) => m.key)).toEqual(["elior entretris", "uber trip"]);
  });

  it("retient la date la plus récente du groupe", () => {
    const out = aggregateByMerchant([
      t("1", "2026-08-05", -20, ELIOR_A),
      t("2", "2026-09-12", -12.5, ELIOR_B),
    ]);
    expect(out[0].lastDate).toBe("2026-09-12");
  });

  it("affiche le libellé le plus fréquent du groupe", () => {
    const out = aggregateByMerchant([
      t("1", "2026-08-05", -20, ELIOR_A),
      t("2", "2026-08-06", -20, ELIOR_A),
      t("3", "2026-09-12", -12.5, ELIOR_B),
    ]);
    expect(out[0].label).toBe(ELIOR_A);
  });

  it("ignore les libellés qui ne produisent aucune clé", () => {
    expect(aggregateByMerchant([t("1", "2026-08-05", -20, "")])).toEqual([]);
  });

  it("rend une liste vide pour une entrée vide", () => {
    expect(aggregateByMerchant([])).toEqual([]);
  });

  it("somme aussi les montants positifs, en valeur absolue", () => {
    const out = aggregateByMerchant([
      t("1", "2026-08-05", 2795.12, "VIR SEPA RECU /DE CARREFOUR FRANCE /MOTIF  /REF X"),
    ]);
    expect(out[0].key).toBe("carrefour france");
    expect(out[0].total).toBeCloseTo(2795.12);
  });
});

describe("merchantSeries", () => {
  it("rend les totaux mensuels par ordre croissant", () => {
    const out = merchantSeries(
      [
        t("1", "2026-09-12", -12.5, ELIOR_B),
        t("2", "2026-08-05", -20, ELIOR_A),
        t("3", "2026-08-06", -10, ELIOR_A),
      ],
      "elior entretris"
    );
    expect(out).toEqual([
      { month: "2026-08", total: 30 },
      { month: "2026-09", total: 12.5 },
    ]);
  });

  it("n'invente pas les mois sans opération", () => {
    const out = merchantSeries(
      [
        t("1", "2026-08-05", -20, ELIOR_A),
        t("2", "2026-10-05", -20, ELIOR_A),
      ],
      "elior entretris"
    );
    expect(out.map((p) => p.month)).toEqual(["2026-08", "2026-10"]);
  });

  it("rend une série vide pour un commerçant inconnu", () => {
    expect(merchantSeries([t("1", "2026-08-05", -20, ELIOR_A)], "inconnu")).toEqual([]);
  });
});
