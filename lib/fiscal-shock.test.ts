import { describe, it, expect } from "vitest";
import { ratesByYear, abondementFactors, exitRates } from "./fiscal-shock";
import type { FiscalRates, PolicyShock } from "./fiscal-shock";

const BASE: FiscalRates = {
  csgPlusValue: 0.186,
  csgAbondement: 0.097,
  tmi: 0.3,
  pfuPER: 0.3,
  csgPEA: 0.172,
};

const r = (shocks: PolicyShock[], years = 10) =>
  ratesByYear(BASE, years, shocks);
const a = (shocks: PolicyShock[], years = 10) =>
  abondementFactors(years, shocks);

describe("ratesByYear", () => {
  it("rend un jeu de taux par année", () => {
    expect(r([])).toHaveLength(10);
  });

  it("sans choc, chaque année porte exactement les taux de base", () => {
    // Égalité stricte : c'est ce qui garantit que le simulateur retrouve ses
    // chiffres d'aujourd'hui au bit près.
    for (const y of r([])) {
      expect(y.csgPlusValue).toBe(0.186);
      expect(y.csgAbondement).toBe(0.097);
      expect(y.tmi).toBe(0.3);
      expect(y.pfuPER).toBe(0.3);
      expect(y.csgPEA).toBe(0.172);
    }
  });

  it("ne remplace que les taux nommés, à partir de l'année dite", () => {
    const out = r([
      { kind: "fiscalite", fromYear: 5, rates: { pfuPER: 0.35 } },
    ]);
    expect(out[4].pfuPER).toBe(0.3);
    expect(out[5].pfuPER).toBe(0.35);
    expect(out[9].pfuPER).toBe(0.35);
    // Tout le reste est intact, y compris après le choc.
    expect(out[9].csgPlusValue).toBe(0.186);
    expect(out[9].tmi).toBe(0.3);
  });

  it("compose deux chocs : le second n'écrase que les siens", () => {
    const out = r([
      { kind: "fiscalite", fromYear: 2, rates: { pfuPER: 0.35, tmi: 0.41 } },
      { kind: "fiscalite", fromYear: 6, rates: { tmi: 0.45 } },
    ]);
    expect(out[3].pfuPER).toBe(0.35);
    expect(out[3].tmi).toBe(0.41);
    // Le PFU du premier choc survit au second.
    expect(out[7].pfuPER).toBe(0.35);
    expect(out[7].tmi).toBe(0.45);
  });

  it("applique les chocs par année croissante quel que soit l'ordre de la liste", () => {
    // Le choc tardif est listé EN PREMIER : une boucle qui traiterait la liste
    // dans l'ordre laisserait tmi à 0,45 dès l'année 6 puis le rabaisserait.
    const out = r([
      { kind: "fiscalite", fromYear: 6, rates: { tmi: 0.45 } },
      { kind: "fiscalite", fromYear: 2, rates: { tmi: 0.41 } },
    ]);
    expect(out[3].tmi).toBe(0.41);
    expect(out[7].tmi).toBe(0.45);
  });

  it("ignore un choc daté hors de l'horizon", () => {
    const out = r([
      { kind: "fiscalite", fromYear: 40, rates: { pfuPER: 0.9 } },
    ]);
    for (const y of out) expect(y.pfuPER).toBe(0.3);
  });

  it("applique dès l'année 0 un choc daté avant l'horizon", () => {
    const out = r([
      { kind: "fiscalite", fromYear: -3, rates: { pfuPER: 0.35 } },
    ]);
    expect(out[0].pfuPER).toBe(0.35);
  });

  it("rend une liste vide pour un horizon nul", () => {
    expect(r([], 0)).toEqual([]);
  });
});

describe("abondementFactors", () => {
  it("sans choc, chaque facteur vaut exactement 1", () => {
    for (const f of a([])) expect(f).toBe(1);
  });

  it("remplace le facteur à partir de l'année dite", () => {
    const out = a([{ kind: "abondement", fromYear: 4, factor: 0.5 }]);
    expect(out[3]).toBe(1);
    expect(out[4]).toBe(0.5);
    expect(out[9]).toBe(0.5);
  });

  it("remplace et ne multiplie pas deux facteurs successifs", () => {
    // « divisé par deux » puis « supprimé » donne 0,5 puis 0 — jamais 0 dès la
    // première fenêtre, et jamais 0,25 par accumulation.
    const out = a([
      { kind: "abondement", fromYear: 4, factor: 0.5 },
      { kind: "abondement", fromYear: 8, factor: 0 },
    ]);
    expect(out[4]).toBe(0.5);
    expect(out[7]).toBe(0.5);
    expect(out[8]).toBe(0);
  });

  it("ignore les chocs fiscaux", () => {
    const out = a([
      { kind: "fiscalite", fromYear: 2, rates: { tmi: 0.45 } },
    ]);
    for (const f of out) expect(f).toBe(1);
  });

  it("ignore un choc daté hors de l'horizon", () => {
    const out = a([{ kind: "abondement", fromYear: 40, factor: 0 }]);
    for (const f of out) expect(f).toBe(1);
  });

  it("clampe un facteur négatif à 0 : l'employeur ne reprend jamais d'argent", () => {
    // Le panneau clampe déjà `factor` côté UI, mais `lib/` reste pur et doit
    // tenir la garantie seule, sans compter sur l'appelant.
    const out = a([{ kind: "abondement", fromYear: 2, factor: -1 }]);
    expect(out[2]).toBe(0);
    expect(out[9]).toBe(0);
  });
});

describe("exitRates", () => {
  it("rend les taux de la dernière année simulée", () => {
    const rates = r([
      { kind: "fiscalite", fromYear: 5, rates: { pfuPER: 0.35 } },
    ]);
    expect(exitRates(rates, BASE).pfuPER).toBe(0.35);
  });

  it("rend les taux de base sur un horizon nul", () => {
    expect(exitRates([], BASE)).toBe(BASE);
  });
});
