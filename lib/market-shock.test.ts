import { describe, it, expect } from "vitest";
import { yearFactors } from "./market-shock";
import type { MarketShock } from "./market-shock";

const f = (shocks: MarketShock[], rate = 0.06, years = 10) =>
  yearFactors({ rate, years, shocks });

describe("yearFactors", () => {
  it("rend un facteur par année", () => {
    expect(f([])).toHaveLength(10);
  });

  it("sans choc, tous les facteurs sont exactement 1 + rate", () => {
    // Strictement égaux, pas seulement proches : c'est ce qui garantit que le
    // chemin sans choc reproduit les chiffres d'aujourd'hui au bit près.
    const out = f([]);
    for (const x of out) expect(x).toBe(1.06);
  });

  it("un krach multiplie la seule année visée", () => {
    const out = f([{ kind: "krach", atYear: 3, dropPct: 0.3 }]);
    expect(out[2]).toBe(1.06);
    expect(out[3]).toBeCloseTo(1.06 * 0.7, 12);
    expect(out[4]).toBe(1.06);
  });

  it("une fenêtre de rendement remplace le taux sur ses bornes exactes", () => {
    // Fenêtre [2, 5) : les années 2, 3 et 4 sont dégradées, la 1 et la 5 non.
    const out = f([{ kind: "rendement", startYear: 2, years: 3, rate: 0 }]);
    expect(out[1]).toBe(1.06);
    expect(out[2]).toBe(1);
    expect(out[4]).toBe(1);
    expect(out[5]).toBe(1.06);
  });

  it("remplace et n'additionne pas : deux années à 0 % valent 0 %", () => {
    const out = f([{ kind: "rendement", startYear: 0, years: 2, rate: 0 }]);
    expect(out[0]).toBe(1);
    expect(out[1]).toBe(1);
  });

  it("un krach posé dans une fenêtre dégradée se combine avec elle", () => {
    const out = f([
      { kind: "rendement", startYear: 2, years: 4, rate: 0.01 },
      { kind: "krach", atYear: 3, dropPct: 0.2 },
    ]);
    expect(out[2]).toBeCloseTo(1.01, 12);
    expect(out[3]).toBeCloseTo(1.01 * 0.8, 12);
  });

  it("deux krachs la même année se multiplient", () => {
    const out = f([
      { kind: "krach", atYear: 4, dropPct: 0.3 },
      { kind: "krach", atYear: 4, dropPct: 0.5 },
    ]);
    expect(out[4]).toBeCloseTo(1.06 * 0.7 * 0.5, 12);
  });

  it("ignore un choc daté hors de l'horizon", () => {
    const out = f([{ kind: "krach", atYear: 40, dropPct: 0.9 }]);
    for (const x of out) expect(x).toBe(1.06);
  });

  it("tronque une fenêtre qui déborde de l'horizon", () => {
    const out = f([{ kind: "rendement", startYear: 8, years: 10, rate: 0 }]);
    expect(out).toHaveLength(10);
    expect(out[8]).toBe(1);
    expect(out[9]).toBe(1);
  });

  it("rend une liste vide pour un horizon nul", () => {
    expect(f([], 0.06, 0)).toEqual([]);
  });
});
