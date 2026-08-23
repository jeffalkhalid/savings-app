import { describe, it, expect } from "vitest";
import { buildSimParams, rankByNet } from "./projection-sim";
import { DEFAULT_PARAMS } from "@/lib/strategies";
import { DEFAULT_BAREME, type AbondementBareme } from "@/lib/abondement";
import { simulate } from "@/lib/simulator";
import type { SimulationResult } from "@/lib/types";

describe("buildSimParams", () => {
  it("applies the exposed overrides", () => {
    const p = buildSimParams({ volontaire: 5000, rate: 0.04, years: 20 });
    expect(p.volontaire).toBe(5000);
    expect(p.rate).toBe(0.04);
    expect(p.years).toBe(20);
  });
  it("keeps DEFAULT_PARAMS for non-exposed params", () => {
    const p = buildSimParams({ volontaire: 0, rate: 0.06, years: 30 });
    expect(p.plafondPEG).toBe(DEFAULT_PARAMS.plafondPEG);
    expect(p.tmi).toBe(DEFAULT_PARAMS.tmi);
    expect(p.interessement).toBe(DEFAULT_PARAMS.interessement);
  });
  it("utilise le barème par défaut quand aucun n'est fourni", () => {
    const p = buildSimParams({ volontaire: 1000, rate: 0.05, years: 10 });
    expect(p.bareme).toEqual(DEFAULT_BAREME);
  });

  it("transmet le barème fourni", () => {
    const custom = {
      peg: { interessement: [], participation: [], volontaire: [] },
      per: { interessement: [], participation: [], volontaire: [] },
    };
    const p = buildSimParams({ volontaire: 1000, rate: 0.05, years: 10, bareme: custom });
    expect(p.bareme).toEqual(custom);
  });
});

const mk = (strategy: string, net: number): SimulationResult =>
  ({
    strategy,
    annual: [],
    summary: { net_total: net, multiplier: net / 1000 },
  } as unknown as SimulationResult);

describe("rankByNet", () => {
  it("sorts by net_total descending", () => {
    const ranked = rankByNet([mk("A", 100), mk("B", 300), mk("C", 200)]);
    expect(ranked.map((r) => r.strategy)).toEqual(["B", "C", "A"]);
  });
  it("does not mutate the input", () => {
    const input = [mk("A", 100), mk("B", 300)];
    rankByNet(input);
    expect(input.map((r) => r.strategy)).toEqual(["A", "B"]);
  });
});

// Finding A : preuve de bout en bout que le barème d'abondement change
// réellement le résultat de simulate(), pas seulement le threading jusqu'à
// buildSimParams. Stratégie B (« PER pur ») : l'abondement PEG n'est jamais
// utilisé (using = false en permanence), et l'abondement PER entre dans
// K_PER_net via min(baseAbondPER, plafondPER), donc la relation entre le
// barème et le résultat reste monotone et sans effet de bord de recyclage.
const RICH_BAREME: AbondementBareme = {
  peg: {
    interessement: [{ upTo: null, rate: 1 }],
    participation: [{ upTo: null, rate: 1 }],
    volontaire: [{ upTo: null, rate: 1 }],
  },
  per: {
    interessement: [{ upTo: null, rate: 1 }],
    participation: [{ upTo: null, rate: 1 }],
    volontaire: [{ upTo: null, rate: 1 }],
  },
};

const EMPTY_BAREME: AbondementBareme = {
  peg: { interessement: [], participation: [], volontaire: [] },
  per: { interessement: [], participation: [], volontaire: [] },
};

function simulateWithBareme(bareme: AbondementBareme) {
  const params = buildSimParams({ volontaire: 1000, rate: 0.06, years: 20, bareme });
  return simulate("B", params);
}

describe("simulate — le barème d'abondement change réellement le résultat", () => {
  it("un barème plus généreux que le défaut augmente strictement net_total", () => {
    const base = simulateWithBareme(DEFAULT_BAREME);
    const rich = simulateWithBareme(RICH_BAREME);
    expect(rich.summary.net_total).toBeGreaterThan(base.summary.net_total);
  });

  it("un barème sans aucun abondement diminue strictement net_total", () => {
    const base = simulateWithBareme(DEFAULT_BAREME);
    const empty = simulateWithBareme(EMPTY_BAREME);
    expect(empty.summary.net_total).toBeLessThan(base.summary.net_total);
  });
});
