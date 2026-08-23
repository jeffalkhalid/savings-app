import { describe, it, expect } from "vitest";
import { simulateAll } from "./simulator";
import { DEFAULT_PARAMS } from "./strategies";
import type { SimulationParams } from "./types";

/** Résumés arrondis au centime, pour un diff lisible. */
function summaries(p: SimulationParams) {
  return simulateAll(p).map((r) => ({
    strategy: r.strategy,
    net_total: Math.round(r.summary.net_total * 100) / 100,
    gross_total: Math.round(r.summary.gross_total * 100) / 100,
    tax_total: Math.round(r.summary.tax_total * 100) / 100,
    multiplier: Math.round(r.summary.multiplier * 10000) / 10000,
  }));
}

describe("simulateAll (caractérisation du barème Carrefour)", () => {
  it("fige les résultats des paramètres par défaut", () => {
    expect(summaries(DEFAULT_PARAMS)).toMatchInlineSnapshot(`
      [
        {
          "gross_total": 374071.52,
          "multiplier": 3.0517,
          "net_total": 366208.03,
          "strategy": "A",
          "tax_total": 7863.49,
        },
        {
          "gross_total": 470236.12,
          "multiplier": 3.1298,
          "net_total": 375580.89,
          "strategy": "B",
          "tax_total": 94655.23,
        },
        {
          "gross_total": 450601.58,
          "multiplier": 3.4475,
          "net_total": 413694.79,
          "strategy": "C",
          "tax_total": 36906.79,
        },
        {
          "gross_total": 492160.1,
          "multiplier": 3.5753,
          "net_total": 429030.97,
          "strategy": "D",
          "tax_total": 63129.13,
        },
        {
          "gross_total": 413358.55,
          "multiplier": 3.1376,
          "net_total": 376508.67,
          "strategy": "E",
          "tax_total": 36849.87,
        },
        {
          "gross_total": 500289.19,
          "multiplier": 3.5881,
          "net_total": 430567.4,
          "strategy": "F",
          "tax_total": 69721.79,
        },
      ]
    `);
  });

  it("fige les résultats d'un profil à forts versements", () => {
    const p: SimulationParams = {
      ...DEFAULT_PARAMS,
      interessement: 3000,
      participation: 2000,
      volontaire: 2500,
      years: 15,
      rate: 0.04,
    };
    expect(summaries(p)).toMatchInlineSnapshot(`
      [
        {
          "gross_total": 177158.88,
          "multiplier": 1.5522,
          "net_total": 174626.08,
          "strategy": "A",
          "tax_total": 2532.8,
        },
        {
          "gross_total": 210397.85,
          "multiplier": 1.6337,
          "net_total": 183794.51,
          "strategy": "B",
          "tax_total": 26603.34,
        },
        {
          "gross_total": 208995.07,
          "multiplier": 1.7411,
          "net_total": 195873.83,
          "strategy": "C",
          "tax_total": 13121.24,
        },
        {
          "gross_total": 213278,
          "multiplier": 1.7636,
          "net_total": 198401.24,
          "strategy": "D",
          "tax_total": 14876.76,
        },
        {
          "gross_total": 181445.11,
          "multiplier": 1.5558,
          "net_total": 175031.3,
          "strategy": "E",
          "tax_total": 6413.82,
        },
        {
          "gross_total": 213743.43,
          "multiplier": 1.7638,
          "net_total": 198430.36,
          "strategy": "F",
          "tax_total": 15313.07,
        },
      ]
    `);
  });

  it("fige les résultats sans aucun versement", () => {
    const p: SimulationParams = {
      ...DEFAULT_PARAMS,
      interessement: 0,
      participation: 0,
      volontaire: 0,
    };
    expect(summaries(p)).toMatchInlineSnapshot(`
      [
        {
          "gross_total": 0,
          "multiplier": NaN,
          "net_total": 0,
          "strategy": "A",
          "tax_total": 0,
        },
        {
          "gross_total": 0,
          "multiplier": NaN,
          "net_total": 0,
          "strategy": "B",
          "tax_total": 0,
        },
        {
          "gross_total": 0,
          "multiplier": NaN,
          "net_total": 0,
          "strategy": "C",
          "tax_total": 0,
        },
        {
          "gross_total": 0,
          "multiplier": NaN,
          "net_total": 0,
          "strategy": "D",
          "tax_total": 0,
        },
        {
          "gross_total": 0,
          "multiplier": NaN,
          "net_total": 0,
          "strategy": "E",
          "tax_total": 0,
        },
        {
          "gross_total": 0,
          "multiplier": NaN,
          "net_total": 0,
          "strategy": "F",
          "tax_total": 0,
        },
      ]
    `);
  });
});
