import type {
  AnnualSnapshot,
  SimulationParams,
  SimulationResult,
  StrategyKey,
} from "./types";
import { STRATEGIES, STRATEGY_KEYS } from "./strategies";

/**
 * Abondement employeur sur PEG/PEE (barème Carrefour utilisé par défaut).
 * I = intéressement, P = participation, V = volontaire — montants annuels.
 */
function computeAbondementPEG(I: number, P: number, V: number): number {
  // Intéressement : 0-450 @ 40%, 450+ @ 20%
  const aInt =
    Math.max(0, Math.min(I, 450)) * 0.4 + Math.max(0, I - 450) * 0.2;
  // Participation : pas d'abondement
  const aPart = 0;
  // Volontaire : 0-1B @ 20% (pratiquement non plafonné)
  const aVol = Math.max(0, Math.min(V, 1_000_000)) * 0.2;
  return aInt + aPart + aVol;
}

/**
 * Abondement employeur sur PER.
 */
function computeAbondementPER(I: number, P: number, V: number): number {
  // Intéressement : 0-1000 @ 50%, 1000+ @ 20%
  const aInt =
    Math.max(0, Math.min(I, 1000)) * 0.5 + Math.max(0, I - 1000) * 0.2;
  // Participation : 30%
  const aPart = P * 0.3;
  // Volontaire : 0-550 @ 100%, 550-2000 @ 50%, 2000+ @ 25%
  const aVol =
    Math.max(0, Math.min(V, 550)) * 1.0 +
    Math.max(0, Math.min(V, 2000) - 550) * 0.5 +
    Math.max(0, V - 2000) * 0.25;
  return aInt + aPart + aVol;
}

export function simulate(
  strategy: StrategyKey,
  p: SimulationParams,
): SimulationResult {
  const { interessement: I, participation: P, volontaire: V } = p;
  const {
    rate,
    years,
    csgPlusValue: csgPV,
    csgAbondement: csgAb,
    tmi,
    pfuPER,
    csgPEA,
    plafondPEG,
    plafondPER,
  } = p;

  const baseAbondPEG = computeAbondementPEG(I, P, V);
  const baseAbondPER = computeAbondementPER(I, P, V);

  // CSG 9.7% applies ONLY to the abondement employeur (not to I, P, V).
  // Intéressement and participation enter PEG/PER at their full gross value.
  const K_PEG_net = I + P + V + baseAbondPEG * (1 - csgAb);
  const K_PER_net = I + P + V + Math.min(baseAbondPER, plafondPER) * (1 - csgAb);

  const meta = STRATEGIES[strategy];
  const smart = meta.smart;
  const growth5y = (1 + rate) ** 5;
  const gainFrac5y = 1 - 1 / growth5y;

  const D: number[] = new Array(years).fill(0);

  // Initial state
  let P_peg = p.initialPEG;
  let P_per = p.initialPER;
  let basisPeg = p.initialPegBasis;
  let basisPer = p.initialPerBasis;
  let volCumul = p.initialVolPER;
  let peaBonus = 0;
  let saturated = false;

  // Calendrier de déblocage des cohortes PEG existantes
  const initialUnlock: number[] = [
    p.initialPegUnlock0 ?? 0,
    p.initialPegUnlock1 ?? 0,
    p.initialPegUnlock2 ?? 0,
    p.initialPegUnlock3 ?? 0,
    p.initialPegUnlock4 ?? 0,
  ];

  const annual: AnnualSnapshot[] = [];

  for (let t = 0; t < years; t++) {
    let using: boolean;
    switch (strategy) {
      case "A":
      case "E":
        using = true;
        break;
      case "B":
        using = false;
        break;
      case "C":
        using = !saturated;
        break;
      case "D":
      case "F":
        using = t <= 4;
        break;
    }

    const K_peg_t = using ? K_PEG_net : 0;
    const K_per_t = using ? 0 : K_PER_net;
    const vol_t = using ? 0 : V;

    // Mature this year = our matured cohort (deposited 5 years ago)
    // + initial PEG cohort scheduled to unlock this year (only if using PEG)
    let matureFromOurs = 0;
    if (t >= 5) {
      matureFromOurs = D[t - 5] * growth5y;
    }
    const matureFromInitial = t < 5 && using ? initialUnlock[t] : 0;
    const mature = matureFromOurs + matureFromInitial;

    let W = 0;
    let N = 0;
    let netRedeposit = 0;
    let M_gross = 0;
    let M_net = 0;

    if (mature > 0) {
      const M_cap_gross = plafondPEG - (using ? baseAbondPEG : 0);
      if (smart) {
        const targetW = M_cap_gross / 0.2 / (1 - gainFrac5y * csgPV);
        W = Math.min(targetW, mature);
      } else {
        W = mature;
      }
      N = W * gainFrac5y * csgPV;
      netRedeposit = W - N;
      M_gross = Math.min(M_cap_gross, netRedeposit * 0.2);
      M_net = M_gross * (1 - csgAb);

      if (
        strategy === "C" &&
        using &&
        !saturated &&
        M_gross >= M_cap_gross - 0.01
      ) {
        saturated = true;
      }
    }

    D[t] = K_peg_t + M_net + netRedeposit;
    P_peg = P_peg * (1 + rate) + K_peg_t + M_net - N;
    P_per = P_per * (1 + rate) + K_per_t;

    // Basis tracking
    if (mature > 0) {
      const basisWithdrawn = W / growth5y;
      basisPeg += K_peg_t + M_net + (netRedeposit - basisWithdrawn);
    } else {
      basisPeg += K_peg_t;
    }
    basisPer += K_per_t;
    volCumul += vol_t;
    peaBonus = peaBonus * (1 + rate) + tmi * vol_t;

    annual.push({
      year: t,
      usePEG: using ? 1 : 0,
      K_PEG: K_peg_t,
      K_PER: K_per_t,
      mature,
      W,
      N,
      M_gross,
      M_net,
      D_total: D[t],
      P_PEG: P_peg,
      P_PER: P_per,
      basis_PEG: basisPeg,
      PEA_bonus: peaBonus,
      total_gross: P_peg + P_per + peaBonus,
    });
  }

  // Fiscalité de sortie
  const PV_peg = Math.max(0, P_peg - basisPeg);
  const PV_per = Math.max(0, P_per - basisPer);
  const peaBasisNominal = tmi * volCumul;
  const PV_pea = Math.max(0, peaBonus - peaBasisNominal);

  const tax_PEG_exit = PV_peg * csgPV;
  const tax_PER_IR = tmi * volCumul;
  const tax_PER_PFU = PV_per * pfuPER;
  const tax_PEA_exit = PV_pea * csgPEA;
  const tax_total =
    tax_PEG_exit + tax_PER_IR + tax_PER_PFU + tax_PEA_exit;

  const grossTotal = P_peg + P_per + peaBonus;
  const netTotal = grossTotal - tax_total;
  const personalContrib = (I + P + V) * years;

  return {
    strategy,
    annual,
    summary: {
      V_PEG_final: P_peg,
      V_PER_final: P_per,
      PEA_final: peaBonus,
      gross_total: grossTotal,
      basis_PEG: basisPeg,
      basis_PER: basisPer,
      vol_cumul_PER: volCumul,
      PV_PEG: PV_peg,
      PV_PER: PV_per,
      PV_PEA: PV_pea,
      tax_PEG_exit,
      tax_PER_IR,
      tax_PER_PFU,
      tax_PEA_exit,
      tax_total,
      net_total: netTotal,
      multiplier: netTotal / personalContrib,
    },
  };
}

export function simulateAll(p: SimulationParams): SimulationResult[] {
  return STRATEGY_KEYS.map((k) => simulate(k, p));
}
