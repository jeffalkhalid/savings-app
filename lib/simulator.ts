import type {
  AnnualSnapshot,
  SimulationParams,
  SimulationResult,
  StrategyKey,
} from "./types";
import { STRATEGIES, STRATEGY_KEYS } from "./strategies";
import { computeAbondement } from "./abondement";
import { yearFactors } from "./market-shock";
import { ratesByYear, abondementFactors, exitRates } from "./fiscal-shock";
import type { FiscalRates } from "./fiscal-shock";

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

  const baseAbondPEG = computeAbondement(p.bareme.peg, I, P, V);
  const baseAbondPER = computeAbondement(p.bareme.per, I, P, V);

  const meta = STRATEGIES[strategy];
  const smart = meta.smart;
  const growth5y = (1 + rate) ** 5;

  const shocks = p.shocks ?? [];
  const factors = yearFactors({ rate, years, shocks });
  // « Choqué » veut dire qu'un facteur diffère réellement, pas qu'une liste
  // est non vide : un choc daté hors de l'horizon ne doit rien changer, pas
  // même les derniers bits.
  const shocked = factors.some((f) => f !== 1 + rate);

  const policyShocks = p.policyShocks ?? [];
  const baseRates: FiscalRates = {
    csgPlusValue: csgPV,
    csgAbondement: csgAb,
    tmi,
    pfuPER,
    csgPEA,
  };
  const rates = ratesByYear(baseRates, years, policyShocks);
  const abondF = abondementFactors(years, policyShocks);
  const exit = exitRates(rates, baseRates);
  // La base du bonus PEA ne peut devenir une somme que si la TMI varie : sinon
  // `Σ tmi × vol_t` différerait de `tmi × Σ vol_t` des derniers bits, pour
  // rien. Voir §3.1 de la spec.
  const tmiVaries = rates.some((y) => y.tmi !== tmi);

  /**
   * Croissance d'une cohorte déposée en `t - 5` et recyclée en `t`.
   *
   * Sans choc on rend le scalaire tel quel — surtout pas le produit de cinq
   * facteurs identiques, qui différerait des derniers bits et ferait bouger des
   * chiffres qu'aucun choc n'a touchés.
   */
  const growth5yAt = (t: number): number => {
    if (!shocked) return growth5y;
    // Fenêtre t−4 … t : une cohorte déposée en t−5 entre dans le portefeuille
    // APRÈS la croissance de son année, donc elle ne subit pas `factors[t-5]`,
    // et elle subit bien celle de l'année où elle est recyclée. Les années
    // antérieures à la simulation sont comptées au taux de base : leur
    // plus-value s'est accumulée hors fenêtre, aucun choc daté ne s'y applique.
    let g = (1 + rate) ** Math.max(0, 4 - t);
    for (let k = Math.max(0, t - 4); k <= t; k++) g *= factors[k];
    return g;
  };

  const D: number[] = new Array(years).fill(0);

  // Initial state
  let P_peg = p.initialPEG;
  let P_per = p.initialPER;
  let basisPeg = p.initialPegBasis;
  let basisPer = p.initialPerBasis;
  let volCumul = p.initialVolPER;
  let peaBonus = 0;
  // Base nominale du bonus PEA, accumulée au taux de chaque année. Initialisée
  // avec les versements antérieurs à la simulation, déduits au taux de base.
  let peaBasisAcc = tmi * p.initialVolPER;
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

    const r_t = rates[t] ?? baseRates;
    // `?? baseRates` / `?? 1` sont du ceinture-et-bretelles sur un chemin
    // inatteignable : `rates` et `abondF` sont dimensionnés sur
    // `Math.round(years)`, mais `new Array(years).fill(0)` ci-dessus lève
    // déjà un RangeError pour un horizon non entier, avant que `t` n'atteigne
    // jamais un index hors bornes ici. Gardés par prudence, pas parce que ce
    // cas se produit.
    const abondPEG_t = baseAbondPEG * (abondF[t] ?? 1);
    const abondPER_t = baseAbondPER * (abondF[t] ?? 1);
    // CSG 9.7% applies ONLY to the abondement employeur (not to I, P, V).
    // Intéressement and participation enter PEG/PER at their full gross value.
    // Multiplier par un facteur qui vaut exactement 1 est exact en IEEE-754 :
    // sans choc d'abondement, ces deux expressions sont celles d'avant, au bit
    // près.
    const K_PEG_net_t = I + P + V + abondPEG_t * (1 - r_t.csgAbondement);
    const K_PER_net_t =
      I + P + V + Math.min(abondPER_t, plafondPER) * (1 - r_t.csgAbondement);
    // Le taux d'abondement du recyclage est de l'argent employeur au même titre
    // que le versement : un facteur qui supprime l'abondement doit le supprimer
    // aussi, sans quoi « supprimé » ferait toucher DAVANTAGE (le plafond libéré
    // n'étant plus consommé par le versement).
    const abondRate_t = 0.2 * (abondF[t] ?? 1);

    const K_peg_t = using ? K_PEG_net_t : 0;
    const K_per_t = using ? 0 : K_PER_net_t;
    const vol_t = using ? 0 : V;

    // Croissance et part de plus-value de la cohorte recyclée cette année.
    const g5 = growth5yAt(t);
    // Une cohorte qui vaut moins qu'à son dépôt n'a AUCUNE plus-value : ni CSG
    // à prélever, ni base fiscale à gonfler. Sans ces deux bornes, un krach
    // rembourse de l'impôt et crédite plus de base que le montant retiré.
    const gainFrac = Math.max(0, 1 - 1 / g5);

    // Mature this year = our matured cohort (deposited 5 years ago)
    // + initial PEG cohort scheduled to unlock this year (only if using PEG)
    let matureFromOurs = 0;
    if (t >= 5) {
      matureFromOurs = D[t - 5] * g5;
    }
    const matureFromInitial = t < 5 && using ? initialUnlock[t] : 0;
    const mature = matureFromOurs + matureFromInitial;

    let W = 0;
    let N = 0;
    let netRedeposit = 0;
    let M_gross = 0;
    let M_net = 0;

    if (mature > 0) {
      // Clampé à 0 : un choc d'abondement au-delà d'environ ×3,9, ou un
      // `plafondPEG` réglé sous l'abondement du barème, rendraient sinon
      // `M_cap_gross` négatif — l'employeur « reprendrait » de l'argent sur le
      // recyclage, ce qui n'a pas de sens. Ce plancher existe même sans choc :
      // le slider de plafond seul peut descendre sous l'abondement de base.
      const M_cap_gross = Math.max(0, plafondPEG - (using ? abondPEG_t : 0));
      if (smart) {
        // Sans abondement de recyclage, retirer ne rapporte plus rien et ne
        // coûte que la CSG : la cible est nulle.
        const targetW =
          abondRate_t > 0
            ? M_cap_gross / abondRate_t / (1 - gainFrac * r_t.csgPlusValue)
            : 0;
        W = Math.min(targetW, mature);
      } else {
        W = mature;
      }
      N = W * gainFrac * r_t.csgPlusValue;
      netRedeposit = W - N;
      M_gross = Math.min(M_cap_gross, netRedeposit * abondRate_t);
      M_net = M_gross * (1 - r_t.csgAbondement);

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
    P_peg = P_peg * factors[t] + K_peg_t + M_net - N;
    P_per = P_per * factors[t] + K_per_t;

    // Basis tracking
    if (mature > 0) {
      const basisWithdrawn = Math.min(W, W / g5);
      basisPeg += K_peg_t + M_net + (netRedeposit - basisWithdrawn);
    } else {
      basisPeg += K_peg_t;
    }
    basisPer += K_per_t;
    volCumul += vol_t;
    peaBonus = peaBonus * factors[t] + r_t.tmi * vol_t;
    peaBasisAcc += r_t.tmi * vol_t;

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
  const peaBasisNominal = tmiVaries ? peaBasisAcc : tmi * volCumul;
  const PV_pea = Math.max(0, peaBonus - peaBasisNominal);

  const tax_PEG_exit = PV_peg * exit.csgPlusValue;
  const tax_PER_IR = exit.tmi * volCumul;
  const tax_PER_PFU = PV_per * exit.pfuPER;
  const tax_PEA_exit = PV_pea * exit.csgPEA;
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
