import { describe, it, expect } from "vitest";
import { monthPace, PROJECTION_FROM_DAY } from "./pace";

const base = {
  resteAVivre: 1000,
  pendingEngagements: 0,
  variable: 0,
  today: "2026-08-15",
};

describe("disponible", () => {
  it("déduit les engagements attendus non encore prélevés", () => {
    const p = monthPace({ ...base, resteAVivre: 1000, pendingEngagements: 400 });
    expect(p.disponible).toBe(600);
  });

  it("égale le reste à vivre quand aucun engagement n'est en attente", () => {
    // Continuité avec le chiffre que le Cockpit affiche déjà.
    const p = monthPace({ ...base, resteAVivre: 1000, pendingEngagements: 0 });
    expect(p.disponible).toBe(1000);
  });

  it("peut être négatif quand le mois est déjà dépassé", () => {
    const p = monthPace({ ...base, resteAVivre: 100, pendingEngagements: 400 });
    expect(p.disponible).toBe(-300);
  });
});

describe("jours", () => {
  it("compte le jour courant dans les jours restants", () => {
    // Août a 31 jours ; le 28, il reste 28, 29, 30, 31.
    const p = monthPace({ ...base, today: "2026-08-28" });
    expect(p.joursEcoules).toBe(28);
    expect(p.joursRestants).toBe(4);
  });

  it("laisse un jour restant le dernier jour du mois", () => {
    const p = monthPace({ ...base, today: "2026-08-31" });
    expect(p.joursRestants).toBe(1);
  });

  it("s'adapte à un mois de 30 jours", () => {
    const p = monthPace({ ...base, today: "2026-04-10" });
    expect(p.joursRestants).toBe(21);
  });

  it("s'adapte à février", () => {
    const p = monthPace({ ...base, today: "2026-02-10" });
    expect(p.joursRestants).toBe(19);
  });

  it("s'adapte à un février bissextile", () => {
    const p = monthPace({ ...base, today: "2028-02-10" });
    expect(p.joursRestants).toBe(20);
  });
});

describe("parJour", () => {
  it("divise le disponible par les jours restants", () => {
    // Le 28 août : 4 jours restants, 600 € disponibles.
    const p = monthPace({
      ...base,
      resteAVivre: 1000,
      pendingEngagements: 400,
      today: "2026-08-28",
    });
    expect(p.parJour).toBeCloseTo(150);
  });

  it("est plancherisé à 0 quand le disponible est négatif", () => {
    const p = monthPace({ ...base, resteAVivre: 0, pendingEngagements: 300 });
    expect(p.parJour).toBe(0);
  });
});

describe("rythmeVariable", () => {
  it("divise les dépenses variables par les jours écoulés", () => {
    const p = monthPace({ ...base, variable: 300, today: "2026-08-10" });
    expect(p.rythmeVariable).toBeCloseTo(30);
  });

  it("vaut 0 sans dépense variable", () => {
    const p = monthPace({ ...base, variable: 0, today: "2026-08-10" });
    expect(p.rythmeVariable).toBe(0);
  });

  it("sur un seul jour écoulé, vaut le variable du jour lui-même", () => {
    const p = monthPace({ ...base, variable: 45, today: "2026-08-01" });
    expect(p.joursEcoules).toBe(1);
    expect(p.rythmeVariable).toBe(45);
  });
});

describe("finDeMois", () => {
  it("n'est pas calculée avant le seuil", () => {
    for (let d = 1; d < PROJECTION_FROM_DAY; d++) {
      const day = String(d).padStart(2, "0");
      const p = monthPace({ ...base, variable: 100, today: `2026-08-${day}` });
      expect(p.finDeMois).toBeNull();
    }
  });

  it("est calculée à partir du seuil", () => {
    const p = monthPace({ ...base, variable: 100, today: "2026-08-08" });
    expect(p.finDeMois).not.toBeNull();
  });

  it("retranche le variable extrapolé sur les jours après aujourd'hui", () => {
    // Le 21 août : 21 jours écoulés, et 11 restants (21 au 31 inclus), dont
    // 10 jours après aujourd'hui (22 au 31).
    // Variable 210 € → 10 €/jour. Disponible 1000 € → 1000 − 10 × 10 = 900 €.
    const p = monthPace({
      ...base,
      resteAVivre: 1000,
      pendingEngagements: 0,
      variable: 210,
      today: "2026-08-21",
    });
    expect(p.joursRestants).toBe(11);
    expect(p.finDeMois).toBeCloseTo(900);
  });

  it("égale le disponible le dernier jour du mois — rien à extrapoler", () => {
    // Le 31 août : joursRestants vaut 1, donc (joursRestants − 1) = 0 : la
    // dépense variable du jour même ne doit plus être extrapolée en plus.
    const p = monthPace({
      ...base,
      resteAVivre: 1000,
      pendingEngagements: 200,
      variable: 310,
      today: "2026-08-31",
    });
    expect(p.joursRestants).toBe(1);
    expect(p.finDeMois).toBeCloseTo(p.disponible);
    expect(p.finDeMois).toBeCloseTo(800);
  });

  it("n'extrapole pas les engagements, déjà déduits une fois", () => {
    // Deux cas au même rythme variable : un gros pendingEngagements doit
    // décaler la projection d'exactement son montant, jamais davantage.
    const sans = monthPace({
      ...base,
      resteAVivre: 1000,
      pendingEngagements: 0,
      variable: 210,
      today: "2026-08-21",
    });
    const avec = monthPace({
      ...base,
      resteAVivre: 1000,
      pendingEngagements: 500,
      variable: 210,
      today: "2026-08-21",
    });
    expect((sans.finDeMois as number) - (avec.finDeMois as number)).toBeCloseTo(500);
  });
});
