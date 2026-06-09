export type StrategyKey = "A" | "B" | "C" | "D" | "E" | "F";

export interface SimulationParams {
  // Versements annuels (bruts)
  interessement: number;
  participation: number;
  volontaire: number;

  // Marché
  rate: number;
  years: number;

  // Fiscalité
  csgPlusValue: number; // 18.6% sur les plus-values (recyclage + sortie PEG)
  csgAbondement: number; // 9.7% sur l'abondement uniquement (pas sur I+P+V)
  tmi: number; // TMI pour IR sur volontaire PER déductible
  pfuPER: number; // PFU sur plus-values PER (30%)
  csgPEA: number; // CSG sortie PEA bonus (17.2%)

  // Plafonds annuels (bruts)
  plafondPEG: number; // 2300
  plafondPER: number; // 2500

  // Capital initial (déjà placé)
  initialPEG: number; // Valeur actuelle du PEG
  initialPER: number; // Valeur actuelle du PER
  initialPegBasis: number; // Base fiscale du PEG (défaut = valeur, sinon valeur - PV latente)
  initialPerBasis: number; // Base fiscale du PER
  initialVolPER: number; // Volontaire cumulé déjà versé en PER (pour IR sortie)

  // Calendrier de déblocage du PEG existant
  // Montant qui se débloque (devient recyclable) à chaque année
  initialPegUnlock0: number; // déjà débloqué (recyclable dès année 0)
  initialPegUnlock1: number;
  initialPegUnlock2: number;
  initialPegUnlock3: number;
  initialPegUnlock4: number;
}

export interface AnnualSnapshot {
  year: number;
  usePEG: 0 | 1;
  K_PEG: number;
  K_PER: number;
  mature: number;
  W: number; // retrait gross
  N: number; // CSG sur PV recyclage
  M_gross: number;
  M_net: number;
  D_total: number; // nouvelle cohorte déposée
  P_PEG: number;
  P_PER: number;
  basis_PEG: number;
  PEA_bonus: number;
  total_gross: number;
}

export interface ExitSummary {
  V_PEG_final: number;
  V_PER_final: number;
  PEA_final: number;
  gross_total: number;

  basis_PEG: number;
  basis_PER: number;
  vol_cumul_PER: number;

  PV_PEG: number;
  PV_PER: number;
  PV_PEA: number;

  tax_PEG_exit: number;
  tax_PER_IR: number;
  tax_PER_PFU: number;
  tax_PEA_exit: number;
  tax_total: number;

  net_total: number;
  multiplier: number;
}

export interface SimulationResult {
  strategy: StrategyKey;
  annual: AnnualSnapshot[];
  summary: ExitSummary;
}
