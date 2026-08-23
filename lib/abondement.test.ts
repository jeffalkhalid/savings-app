import { describe, it, expect } from "vitest";
import { computeAbondement, DEFAULT_BAREME } from "./abondement";
import type { PlanBareme } from "./abondement";

const plan = (p: Partial<PlanBareme>): PlanBareme => ({
  interessement: [],
  participation: [],
  volontaire: [],
  ...p,
});

describe("computeAbondement", () => {
  it("renvoie 0 quand aucune tranche n'est définie", () => {
    expect(computeAbondement(plan({}), 1000, 1000, 1000)).toBe(0);
  });

  it("applique une tranche unique non plafonnée", () => {
    const p = plan({ volontaire: [{ upTo: null, rate: 0.2 }] });
    expect(computeAbondement(p, 0, 0, 1000)).toBe(200);
  });

  it("répartit un montant à cheval sur deux tranches", () => {
    const p = plan({
      interessement: [
        { upTo: 450, rate: 0.4 },
        { upTo: null, rate: 0.2 },
      ],
    });
    // 450 * 0.4 = 180, puis 1050 * 0.2 = 210
    expect(computeAbondement(p, 1500, 0, 0)).toBe(390);
  });

  it("n'abonde rien au-delà de la dernière tranche plafonnée", () => {
    const p = plan({ volontaire: [{ upTo: 500, rate: 0.5 }] });
    expect(computeAbondement(p, 0, 0, 800)).toBe(250);
  });

  it("additionne les trois sources", () => {
    const p = plan({
      interessement: [{ upTo: null, rate: 0.1 }],
      participation: [{ upTo: null, rate: 0.2 }],
      volontaire: [{ upTo: null, rate: 0.3 }],
    });
    expect(computeAbondement(p, 100, 100, 100)).toBe(60);
  });

  it("traite les montants nuls ou négatifs comme zéro", () => {
    const p = plan({ volontaire: [{ upTo: null, rate: 0.2 }] });
    expect(computeAbondement(p, 0, 0, 0)).toBe(0);
    expect(computeAbondement(p, 0, 0, -500)).toBe(0);
  });
});

describe("DEFAULT_BAREME (non-régression Carrefour)", () => {
  it("reproduit l'abondement PEG des paramètres par défaut", () => {
    // I=1500 → 180 + 210 = 390 ; P=1500 → 0 ; V=1000 → 200
    expect(computeAbondement(DEFAULT_BAREME.peg, 1500, 1500, 1000)).toBe(590);
  });

  it("reproduit l'abondement PER des paramètres par défaut", () => {
    // I=1500 → 500 + 100 = 600 ; P=1500 → 450 ; V=1000 → 550 + 225 = 775
    expect(computeAbondement(DEFAULT_BAREME.per, 1500, 1500, 1000)).toBe(1825);
  });

  it("n'abonde pas la participation sur le PEG", () => {
    expect(computeAbondement(DEFAULT_BAREME.peg, 0, 5000, 0)).toBe(0);
  });

  it("applique la troisième tranche du volontaire PER", () => {
    // 550 * 1 + 1450 * 0.5 + 1000 * 0.25 = 550 + 725 + 250
    expect(computeAbondement(DEFAULT_BAREME.per, 0, 0, 3000)).toBe(1525);
  });
});
