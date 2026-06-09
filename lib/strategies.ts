import type { StrategyKey } from "./types";

export interface StrategyMeta {
  key: StrategyKey;
  label: string;
  short: string;
  description: string;
  color: string;
  smart: boolean;
}

export const STRATEGIES: Record<StrategyKey, StrategyMeta> = {
  A: {
    key: "A",
    label: "PEG agressif",
    short: "PEG agressif",
    description:
      "100% PEG. Recyclage récursif : chaque cohorte est intégralement recyclée à sa maturité, et le principal recyclé devient lui-même recyclable 5 ans plus tard.",
    color: "#B45342",
    smart: false,
  },
  B: {
    key: "B",
    label: "PER pur",
    short: "PER pur",
    description:
      "100% PER, aucun recyclage. Abondement plus généreux (1825€/an), mais l'argent reste bloqué jusqu'à la retraite.",
    color: "#4A6FA5",
    smart: false,
  },
  C: {
    key: "C",
    label: "PEG jusqu'à saturation, puis PER",
    short: "PEG sat. → PER",
    description:
      "PEG avec recyclage tant que le plafond M n'est pas saturé. Une fois saturé (≈ année 10), bascule des nouveaux versements vers PER. Le PEG continue son auto-recyclage.",
    color: "#836FB2",
    smart: false,
  },
  D: {
    key: "D",
    label: "PEG 5 ans pour amorcer, puis PER",
    short: "PEG 5 ans → PER",
    description:
      "5 années en PEG pour amorcer la chaîne de recyclage, puis bascule vers PER dès l'année 5. Le PEG continue son recyclage agressif.",
    color: "#4F8B82",
    smart: false,
  },
  E: {
    key: "E",
    label: "PEG recyclage optimal (smart)",
    short: "PEG smart",
    description:
      "100% PEG, mais retrait optimal : on ne sort de la cohorte mature que le strict nécessaire pour saturer le plafond M. Le reste dort dans le PEG, débloqué mais non taxé.",
    color: "#B89968",
    smart: true,
  },
  F: {
    key: "F",
    label: "PEG 5 ans smart + PER",
    short: "PEG 5 ans smart + PER",
    description:
      "Combine D et E. Amorçage 5 ans en PEG, puis PER pour les nouveaux versements. Le PEG résiduel pratique le recyclage optimal.",
    color: "#2D7A4F",
    smart: true,
  },
};

export const STRATEGY_KEYS: StrategyKey[] = ["A", "B", "C", "D", "E", "F"];

export const DEFAULT_PARAMS = {
  interessement: 1500,
  participation: 1500,
  volontaire: 1000,
  rate: 0.06,
  years: 30,
  csgPlusValue: 0.186,
  csgAbondement: 0.097,
  tmi: 0.3,
  pfuPER: 0.3,
  csgPEA: 0.172,
  plafondPEG: 2300,
  plafondPER: 2500,
  initialPEG: 0,
  initialPER: 0,
  initialPegBasis: 0,
  initialPerBasis: 0,
  initialVolPER: 0,
  initialPegUnlock0: 0,
  initialPegUnlock1: 0,
  initialPegUnlock2: 0,
  initialPegUnlock3: 0,
  initialPegUnlock4: 0,
};
