export type McPoint = { year: number; p10: number; p50: number; p90: number };

export type RiskProfile = {
  key: string;
  label: string;
  mu: number;
  sigma: number;
};

export const RISK_PROFILES: RiskProfile[] = [
  { key: "prudent", label: "Prudent", mu: 0.03, sigma: 0.06 },
  { key: "equilibre", label: "Équilibré", mu: 0.05, sigma: 0.12 },
  { key: "dynamique", label: "Dynamique", mu: 0.07, sigma: 0.18 },
];

// PRNG déterministe 32 bits.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Normale standard (Box-Muller) depuis un rng() uniforme [0,1).
export function gaussian(rng: () => number): number {
  let u1 = rng();
  if (u1 < 1e-12) u1 = 1e-12;
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// p ∈ [0,1] sur un tableau trié croissant (interpolation linéaire).
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

export function simulateMonteCarlo(input: {
  initial: number;
  annualContribution: number;
  mu: number;
  sigma: number;
  years: number;
  runs: number;
  seed: number;
}): McPoint[] {
  const { initial, annualContribution, mu, sigma, years, runs, seed } = input;
  const rng = mulberry32(seed);
  const drift = Math.log(1 + mu) - (sigma * sigma) / 2;
  const valuesByYear: number[][] = Array.from({ length: years + 1 }, () => []);

  for (let r = 0; r < runs; r++) {
    let v = initial;
    valuesByYear[0].push(v);
    for (let t = 1; t <= years; t++) {
      const factor = Math.exp(drift + sigma * gaussian(rng));
      v = v * factor + annualContribution;
      valuesByYear[t].push(v);
    }
  }

  return valuesByYear.map((vals, year) => {
    const sorted = [...vals].sort((a, b) => a - b);
    return {
      year,
      p10: percentile(sorted, 0.1),
      p50: percentile(sorted, 0.5),
      p90: percentile(sorted, 0.9),
    };
  });
}
