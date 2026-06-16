import { DEFAULT_PARAMS } from "@/lib/strategies";
import type { SimulationParams, SimulationResult } from "@/lib/types";

export function buildSimParams(input: {
  volontaire: number;
  rate: number;
  years: number;
}): SimulationParams {
  return {
    ...DEFAULT_PARAMS,
    volontaire: input.volontaire,
    rate: input.rate,
    years: input.years,
  };
}

export function rankByNet(results: SimulationResult[]): SimulationResult[] {
  return [...results].sort(
    (a, b) => b.summary.net_total - a.summary.net_total
  );
}
