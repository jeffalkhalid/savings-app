import { describe, it, expect } from "vitest";
import { simulate, simulateAll } from "./simulator";
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

describe("simulateAll sous choc", () => {
  const withShocks = (shocks: SimulationParams["shocks"]) => ({
    ...DEFAULT_PARAMS,
    shocks,
  });

  it("une liste de chocs vide ne change rien", () => {
    // La garantie du chantier : sans choc, le résultat est celui d'avant.
    expect(summaries(withShocks([]))).toEqual(summaries(DEFAULT_PARAMS));
  });

  it("un krach réduit le net de chaque stratégie", () => {
    const base = summaries(DEFAULT_PARAMS);
    const shocked = summaries(
      withShocks([{ kind: "krach", atYear: 3, dropPct: 0.3 }])
    );
    for (let i = 0; i < base.length; i++) {
      expect(shocked[i].strategy).toBe(base[i].strategy);
      expect(shocked[i].net_total).toBeLessThan(base[i].net_total);
    }
  });

  it("la date du krach change son coût", () => {
    // Un krach tardif frappe un encours plus gros, mais laisse moins d'années
    // pour se refaire : les deux écarts n'ont aucune raison d'être égaux.
    const early = summaries(
      withShocks([{ kind: "krach", atYear: 0, dropPct: 0.3 }])
    );
    const late = summaries(
      withShocks([{ kind: "krach", atYear: 9, dropPct: 0.3 }])
    );
    expect(early[0].net_total).not.toBeCloseTo(late[0].net_total, 2);
  });

  it("une période de rendement nul réduit le net", () => {
    const base = summaries(DEFAULT_PARAMS);
    const flat = summaries(
      withShocks([{ kind: "rendement", startYear: 2, years: 4, rate: 0 }])
    );
    for (let i = 0; i < base.length; i++) {
      expect(flat[i].net_total).toBeLessThan(base[i].net_total);
    }
  });

  it("un krach entre le dépôt d'une cohorte et son recyclage réduit ce qui est recyclé", () => {
    // LE test du chantier. La cohorte déposée en année 0 est recyclée en année
    // 5 : elle a traversé le krach de l'année 3. Si `growth5y` était resté un
    // scalaire, le montant mûr serait inchangé et ce test échouerait.
    // La cohorte elle-même (année 0) est antérieure au krach, donc identique :
    // le rapport attendu est exactement 1 − 0,3.
    const base = simulate("A", DEFAULT_PARAMS);
    const shocked = simulate(
      "A",
      withShocks([{ kind: "krach", atYear: 3, dropPct: 0.3 }])
    );
    expect(shocked.annual[0].D_total).toBeCloseTo(base.annual[0].D_total, 6);
    expect(base.annual[5].mature).toBeGreaterThan(0);
    expect(shocked.annual[5].mature).toBeCloseTo(
      base.annual[5].mature * 0.7,
      6
    );
  });

  it("prélève toujours la CSG de recyclage sur une cohorte préexistante", () => {
    // Les cohortes déjà en place se débloquent avant l'année 5. Avec la
    // fenêtre naïve, g5 valait 1 à l'année 0, la part de plus-value tombait à
    // zéro et la CSG de recyclage disparaissait purement et simplement.
    const p = { ...DEFAULT_PARAMS, initialPEG: 20000, initialPegUnlock0: 10000 };
    const base = simulate("A", p);
    const shocked = simulate("A", {
      ...p,
      shocks: [{ kind: "krach" as const, atYear: 3, dropPct: 0.3 }],
    });
    expect(base.annual[0].N).toBeGreaterThan(0);
    expect(shocked.annual[0].N).toBeCloseTo(base.annual[0].N, 6);
  });

  it("N n'est jamais négatif sous un krach qui fait chuter g5 sous 1", () => {
    // À 6 %, (1.06)^5 * 0.7 = 0.9368… < 1 : sans le clamp de `gainFrac`, la
    // cohorte recyclée en année 8 (déposée en année 3, krachée le jour de son
    // dépôt) afficherait une CSG négative. C'est l'assertion dont l'absence a
    // laissé passer le Critical.
    const shocked = simulate(
      "A",
      withShocks([{ kind: "krach", atYear: 3, dropPct: 0.3 }])
    );
    for (const a of shocked.annual) {
      expect(a.N).toBeGreaterThanOrEqual(0);
    }
  });

  it("une cohorte préexistante recyclée en pleine fenêtre du krach ne prélève pas de CSG négative", () => {
    // Cohorte de 8000 € débloquée en année 2 ; krach de 30 % en année 1.
    // Fenêtre de g5(2) = t-4..t = -2..2 -> bornée à 0..2, donc :
    //   g5(2) = 1.06^2 * factors[0] * factors[1] * factors[2]
    //         = 1.1236 * 1.06 * (1.06 * 0.7) * 1.06
    //         = 1.06^4 * 0.742 ≈ 1.262477 * 0.742 ≈ 0.936758  (< 1)
    // Sans le clamp, gainFrac = 1 - 1/0.936758 ≈ -0.0675 et N serait négatif.
    // Les années 1-4 n'étaient testées par aucun test avant ce chantier —
    // exactement où la CSG négative apparaissait pour une cohorte préexistante.
    const p = {
      ...DEFAULT_PARAMS,
      initialPEG: 20000,
      initialPegUnlock2: 8000,
    };
    const shocked = simulate("A", {
      ...p,
      shocks: [{ kind: "krach" as const, atYear: 1, dropPct: 0.3 }],
    });
    expect(shocked.annual[2].N).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(shocked.annual[2].N)).toBe(true);
  });

  it("un krach de 100% reste fini, y compris sur une stratégie smart", () => {
    // dropPct: 1 -> factors[1] = 0, donc tout g5 dont la fenêtre couvre
    // l'année 1 (t = 1..5) vaut 0. gainFrac est alors clampé à 0 (et non
    // -Infinity) : pour les stratégies "smart" (E, F), targetW reste fini
    // au lieu de 0 * -Infinity = NaN, qui aurait pollué P_peg, basis_PEG,
    // gross_total, tax_total et net_total.
    const p = {
      ...DEFAULT_PARAMS,
      initialPEG: 20000,
      initialPegUnlock2: 8000,
      shocks: [{ kind: "krach" as const, atYear: 1, dropPct: 1 }],
    };
    const results = simulateAll(p);
    for (const r of results) {
      expect(Number.isFinite(r.summary.net_total)).toBe(true);
    }
    const smart = results.find((r) => r.strategy === "E")!;
    expect(Number.isFinite(smart.annual[3].N)).toBe(true);
  });
});
