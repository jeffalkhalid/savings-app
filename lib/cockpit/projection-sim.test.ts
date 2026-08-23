import { describe, it, expect } from "vitest";
import { buildSimParams, rankByNet } from "./projection-sim";
import { DEFAULT_PARAMS } from "@/lib/strategies";
import { DEFAULT_BAREME } from "@/lib/abondement";
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
