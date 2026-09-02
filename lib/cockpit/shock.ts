/**
 * Scénarios de choc sur la projection de patrimoine.
 *
 * Le moteur est mensuel — et non annuel comme `projectNetWorth` — parce qu'un
 * choc de six mois n'a de creux visible que si quelque chose entre chaque
 * mois. Conséquence assumée et documentée dans la spec : à contribution
 * égale, ce moteur rend un peu plus que la formule annuelle, parce que
 * déposer chaque mois rapporte davantage que déposer une fois l'an.
 */
export type Shock =
  /** Le flux perd `monthlyIncome × (1 − keepPct)` pendant `months` mois. */
  | { kind: "revenu"; startMonth: number; months: number; keepPct: number }
  /** Retrait ponctuel du capital. */
  | { kind: "depense"; atMonth: number; amount: number }
  /** Le flux baisse de `monthly` € à partir de `startMonth`, sans fin. */
  | { kind: "charges"; startMonth: number; monthly: number }
  /** Le capital perd `dropPct` d'un coup. */
  | { kind: "krach"; atMonth: number; dropPct: number };

export type MonthPoint = { month: number; value: number };

export type ShockSummary = {
  trough: MonthPoint;
  /** Mois entre le premier choc et le retour au niveau d'avant lui. */
  recoveryMonths: number | null;
  deltaAtHorizon: number;
};

/** Ce que les chocs retranchent au flux d'un mois donné. */
function flowPenalty(
  shocks: Shock[],
  month: number,
  monthlyIncome: number
): number {
  let penalty = 0;
  for (const s of shocks) {
    if (
      s.kind === "revenu" &&
      month >= s.startMonth &&
      month < s.startMonth + s.months
    ) {
      penalty += monthlyIncome * (1 - s.keepPct);
    }
    if (s.kind === "charges" && month >= s.startMonth) {
      penalty += s.monthly;
    }
  }
  return penalty;
}

export function projectMonthly(input: {
  initial: number;
  monthlyFlow: number;
  monthlyIncome: number;
  rate: number;
  years: number;
  shocks: Shock[];
}): MonthPoint[] {
  const { initial, monthlyFlow, monthlyIncome, rate, years, shocks } = input;
  // Taux mensuel ÉQUIVALENT, pas rate/12 : c'est ce qui fait retomber la série
  // exactement sur la formule annuelle aux anniversaires quand rien n'est
  // déposé.
  const monthlyRate = (1 + rate) ** (1 / 12) - 1;
  const months = Math.max(0, Math.round(years * 12));

  const out: MonthPoint[] = [{ month: 0, value: initial }];
  let value = initial;

  for (let m = 1; m <= months; m++) {
    value *= 1 + monthlyRate;
    value += monthlyFlow - flowPenalty(shocks, m, monthlyIncome);
    for (const s of shocks) {
      if (s.kind === "depense" && s.atMonth === m) value -= s.amount;
      if (s.kind === "krach" && s.atMonth === m) value *= 1 - s.dropPct;
    }
    // Le capital n'est jamais écrêté : un scénario qui épuise l'épargne doit
    // se voir.
    out.push({ month: m, value });
  }
  return out;
}

export function firstShockMonth(shocks: Shock[]): number | null {
  let first: number | null = null;
  for (const s of shocks) {
    const m = s.kind === "revenu" || s.kind === "charges" ? s.startMonth : s.atMonth;
    if (first === null || m < first) first = m;
  }
  return first;
}

export function summarise(
  base: MonthPoint[],
  shocked: MonthPoint[],
  firstShock: number | null
): ShockSummary {
  let trough = shocked[0] ?? { month: 0, value: 0 };
  for (const p of shocked) if (p.value < trough.value) trough = p;

  const lastBase = base[base.length - 1]?.value ?? 0;
  const lastShocked = shocked[shocked.length - 1]?.value ?? 0;
  const deltaAtHorizon = lastShocked - lastBase;

  if (firstShock === null) {
    return { trough, recoveryMonths: 0, deltaAtHorizon };
  }

  // Niveau juste avant le premier choc : c'est à lui qu'il faut revenir.
  const before = shocked.find((p) => p.month === firstShock - 1)?.value ?? shocked[0].value;
  const dipped = shocked.some((p) => p.month >= firstShock && p.value < before);
  if (!dipped) return { trough, recoveryMonths: 0, deltaAtHorizon };

  // Cherché APRÈS le creux et non après le premier choc : sur un scénario à
  // plusieurs chocs, la courbe peut remonter puis replonger, et le délai qui
  // intéresse est celui du retour durable.
  const back = shocked.find(
    (p) => p.month >= trough.month && p.value >= before
  );
  return {
    trough,
    recoveryMonths: back ? back.month - firstShock : null,
    deltaAtHorizon,
  };
}
