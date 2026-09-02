import { describe, it, expect } from "vitest";
import { projectMonthly, summarise, firstShockMonth } from "./shock";
import type { Shock } from "./shock";
import { projectNetWorth } from "./projection";

const base = {
  initial: 10000,
  monthlyFlow: 0,
  monthlyIncome: 3000,
  rate: 0.05,
  years: 10,
  shocks: [] as Shock[],
};

const at = (points: { month: number; value: number }[], month: number) =>
  points.find((p) => p.month === month)?.value as number;

describe("projectMonthly — la loi de capitalisation", () => {
  it("reproduit exactement projectNetWorth sans contribution", () => {
    // La capitalisation pure doit être identique dans les deux moteurs : c'est
    // ce qui prouve que le passage au mensuel n'a changé que le calendrier des
    // dépôts, pas la loi.
    const monthly = projectMonthly(base);
    const annual = projectNetWorth({
      initial: 10000,
      annualContribution: 0,
      rate: 0.05,
      years: 10,
    });
    for (const { year, value } of annual) {
      expect(at(monthly, year * 12)).toBeCloseTo(value, 6);
    }
  });

  it("part du capital initial au mois 0", () => {
    expect(at(projectMonthly(base), 0)).toBe(10000);
  });

  it("rend un point par mois, horizon compris", () => {
    const out = projectMonthly({ ...base, years: 3 });
    expect(out).toHaveLength(37);
    expect(out[out.length - 1].month).toBe(36);
  });

  it("dépasse la formule annuelle dès qu'on cotise, et l'écart croît", () => {
    // Le déplacement documenté : déposer chaque mois rapporte davantage que
    // déposer une fois l'an. On épingle le sens et la croissance de l'écart,
    // pas une valeur exacte.
    const monthly = projectMonthly({ ...base, monthlyFlow: 500 });
    const annual = projectNetWorth({
      initial: 10000,
      annualContribution: 6000,
      rate: 0.05,
      years: 10,
    });
    const gapAt = (y: number) => at(monthly, y * 12) - annual[y].value;
    expect(gapAt(1)).toBeGreaterThan(0);
    expect(gapAt(10)).toBeGreaterThan(gapAt(1));
  });

  it("capitalise au taux mensuel équivalent, pas au douzième du taux annuel", () => {
    // (1+r)^(1/12) et non r/12 : sur un an, sans flux, on doit retomber sur
    // exactement (1+r).
    const out = projectMonthly({ ...base, years: 1 });
    expect(at(out, 12)).toBeCloseTo(10000 * 1.05, 6);
  });
});

describe("projectMonthly — perte de revenu", () => {
  const withLoss = (keepPct: number) =>
    projectMonthly({
      ...base,
      initial: 20000,
      monthlyFlow: 500,
      monthlyIncome: 3000,
      rate: 0,
      years: 3,
      shocks: [{ kind: "revenu", startMonth: 12, months: 6, keepPct }],
    });

  it("rend le flux négatif quand tout le revenu s'arrête", () => {
    // Flux 500 = revenu 3000 − dépenses 2500. Sans revenu, le flux vaut −2500 :
    // les dépenses continuent, le capital se vide. C'est l'information
    // recherchée.
    const out = withLoss(0);
    expect(at(out, 12) - at(out, 11)).toBeCloseTo(-2500);
  });

  it("n'agit que dans la fenêtre, bornes comprises", () => {
    const out = withLoss(0);
    // Le mois 11 est encore normal, le 17 est le dernier touché, le 18 est
    // revenu à la normale.
    expect(at(out, 11) - at(out, 10)).toBeCloseTo(500);
    expect(at(out, 17) - at(out, 16)).toBeCloseTo(-2500);
    expect(at(out, 18) - at(out, 17)).toBeCloseTo(500);
  });

  it("retranche une fraction du revenu quand une indemnité est conservée", () => {
    // 60 % conservés : on perd 1200 €, le flux passe de 500 à −700.
    const out = withLoss(0.6);
    expect(at(out, 12) - at(out, 11)).toBeCloseTo(-700);
  });
});

describe("projectMonthly — les autres chocs", () => {
  const flat = {
    ...base,
    initial: 20000,
    monthlyFlow: 500,
    rate: 0,
    years: 3,
  };

  it("retire une dépense exceptionnelle au mois exact", () => {
    const out = projectMonthly({
      ...flat,
      shocks: [{ kind: "depense", atMonth: 10, amount: 15000 }],
    });
    expect(at(out, 9)).toBeCloseTo(20000 + 9 * 500);
    expect(at(out, 10)).toBeCloseTo(20000 + 10 * 500 - 15000);
    expect(at(out, 11)).toBeCloseTo(20000 + 11 * 500 - 15000);
  });

  it("applique un krach en pourcentage du capital du mois", () => {
    const out = projectMonthly({
      ...flat,
      shocks: [{ kind: "krach", atMonth: 6, dropPct: 0.3 }],
    });
    expect(at(out, 6)).toBeCloseTo((20000 + 6 * 500) * 0.7);
  });

  it("baisse le flux définitivement pour une hausse de charges", () => {
    const out = projectMonthly({
      ...flat,
      shocks: [{ kind: "charges", startMonth: 12, monthly: 250 }],
    });
    expect(at(out, 12) - at(out, 11)).toBeCloseTo(250);
    expect(at(out, 35) - at(out, 34)).toBeCloseTo(250);
  });

  it("cumule deux chocs actifs le même mois", () => {
    const out = projectMonthly({
      ...flat,
      monthlyIncome: 3000,
      shocks: [
        { kind: "revenu", startMonth: 12, months: 6, keepPct: 0 },
        { kind: "charges", startMonth: 12, monthly: 250 },
      ],
    });
    // 500 − 3000 − 250
    expect(at(out, 12) - at(out, 11)).toBeCloseTo(-2750);
  });

  it("laisse le capital devenir négatif", () => {
    // Un scénario qui épuise l'épargne doit se voir, pas être écrêté à zéro.
    const out = projectMonthly({
      ...flat,
      initial: 5000,
      shocks: [{ kind: "depense", atMonth: 2, amount: 20000 }],
    });
    expect(at(out, 2)).toBeLessThan(0);
  });
});

describe("firstShockMonth", () => {
  it("rend le mois du choc le plus précoce", () => {
    expect(
      firstShockMonth([
        { kind: "depense", atMonth: 24, amount: 100 },
        { kind: "revenu", startMonth: 6, months: 3, keepPct: 0 },
      ])
    ).toBe(6);
  });

  it("rend null sans choc", () => {
    expect(firstShockMonth([])).toBeNull();
  });
});

describe("summarise", () => {
  const flat = {
    ...base,
    initial: 20000,
    monthlyFlow: 500,
    rate: 0,
    years: 5,
  };
  const shocks: Shock[] = [{ kind: "depense", atMonth: 12, amount: 8000 }];
  const baseSeries = projectMonthly(flat);
  const shockedSeries = projectMonthly({ ...flat, shocks });

  it("trouve le creux et sa date", () => {
    // Le retrait doit dépasser ce qui a été accumulé depuis le mois 0, sans
    // quoi le creux serait le capital de départ et le test ne prouverait rien.
    const s = summarise(baseSeries, shockedSeries, 12);
    expect(s.trough.month).toBe(12);
    expect(s.trough.value).toBeCloseTo(18000);
  });

  it("compte les mois jusqu'au retour au niveau d'avant le choc", () => {
    // Niveau au mois 11 : 25 500. Au mois 12 le capital tombe à 18 000, puis
    // remonte de 500 par mois : il repasse 25 500 au mois 27, soit 15 mois
    // après le choc.
    const s = summarise(baseSeries, shockedSeries, 12);
    expect(s.recoveryMonths).toBe(15);
  });

  it("rend 0 quand la trajectoire ne descend jamais sous son niveau d'avant", () => {
    // Une hausse de charges ralentit la croissance sans creuser.
    const only = projectMonthly({
      ...flat,
      shocks: [{ kind: "charges", startMonth: 12, monthly: 100 }],
    });
    expect(summarise(baseSeries, only, 12).recoveryMonths).toBe(0);
  });

  it("rend null quand le niveau d'avant n'est pas retrouvé dans l'horizon", () => {
    const heavy = projectMonthly({
      ...flat,
      shocks: [{ kind: "depense", atMonth: 12, amount: 100000 }],
    });
    expect(summarise(baseSeries, heavy, 12).recoveryMonths).toBeNull();
  });

  it("chiffre l'écart à l'horizon, négatif", () => {
    const s = summarise(baseSeries, shockedSeries, 12);
    expect(s.deltaAtHorizon).toBeCloseTo(-8000);
  });

  it("rend un bilan neutre sans choc", () => {
    const s = summarise(baseSeries, baseSeries, null);
    expect(s.recoveryMonths).toBe(0);
    expect(s.deltaAtHorizon).toBeCloseTo(0);
  });
});
