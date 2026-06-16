import { describe, it, expect } from "vitest";
import { mulberry32, percentile, simulateMonteCarlo } from "./monte-carlo";

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it("returns values in [0,1)", () => {
    const r = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("percentile", () => {
  it("returns the median of a known list", () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
  });
  it("returns the bounds at p=0 and p=1", () => {
    expect(percentile([10, 20, 30], 0)).toBe(10);
    expect(percentile([10, 20, 30], 1)).toBe(30);
  });
});

describe("simulateMonteCarlo", () => {
  it("collapses to the deterministic compound when sigma=0 (flat band)", () => {
    const pts = simulateMonteCarlo({
      initial: 10000,
      annualContribution: 1200,
      mu: 0.05,
      sigma: 0,
      years: 1,
      runs: 50,
      seed: 42,
    });
    expect(pts).toHaveLength(2);
    expect(pts[0]).toEqual({ year: 0, p10: 10000, p50: 10000, p90: 10000 });
    expect(pts[1].p50).toBeCloseTo(11700, 3);
    expect(pts[1].p10).toBeCloseTo(11700, 3);
    expect(pts[1].p90).toBeCloseTo(11700, 3);
  });
  it("spreads p10 < p50 < p90 at the horizon when sigma>0", () => {
    const pts = simulateMonteCarlo({
      initial: 10000,
      annualContribution: 0,
      mu: 0.05,
      sigma: 0.15,
      years: 10,
      runs: 2000,
      seed: 42,
    });
    const last = pts[pts.length - 1];
    expect(last.p10).toBeLessThan(last.p50);
    expect(last.p50).toBeLessThan(last.p90);
  });
  it("has years+1 points and year 0 = initial", () => {
    const pts = simulateMonteCarlo({
      initial: 5000,
      annualContribution: 100,
      mu: 0.04,
      sigma: 0.1,
      years: 5,
      runs: 100,
      seed: 1,
    });
    expect(pts).toHaveLength(6);
    expect(pts[0]).toEqual({ year: 0, p10: 5000, p50: 5000, p90: 5000 });
  });
  it("is reproducible for the same seed", () => {
    const args = {
      initial: 1000,
      annualContribution: 100,
      mu: 0.05,
      sigma: 0.12,
      years: 5,
      runs: 200,
      seed: 99,
    };
    expect(simulateMonteCarlo(args)).toEqual(simulateMonteCarlo(args));
  });
});
