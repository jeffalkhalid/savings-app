import { describe, it, expect } from "vitest";
import {
  eur,
  localISO,
  todayISO,
  currentMonth,
  monthRange,
  axisMonthLabel,
  tooltipMonthLabel,
  monthOffsetLabel,
} from "./format";

describe("eur", () => {
  it("formats in fr-FR euros", () => {
    expect(eur(1960)).toMatch(/1\s?960,00\s?€/);
  });
  it("formats negatives with a minus sign", () => {
    expect(eur(-29)).toMatch(/-?29,00\s?€/);
  });
});

describe("monthRange", () => {
  it("returns first day of month and first day of next month", () => {
    expect(monthRange("2026-05")).toEqual({ start: "2026-05-01", next: "2026-06-01" });
  });
  it("rolls December into the next year", () => {
    expect(monthRange("2026-12")).toEqual({ start: "2026-12-01", next: "2027-01-01" });
  });
});

describe("axisMonthLabel", () => {
  it("formats a compact month, no year", () => {
    expect(axisMonthLabel("2026-08")).toBe("août");
  });
  it("parses at local midnight, not UTC (no off-by-one month)", () => {
    expect(axisMonthLabel("2026-01")).toBe("janv.");
  });
});

describe("tooltipMonthLabel", () => {
  it("includes a 2-digit year", () => {
    expect(tooltipMonthLabel("2026-08")).toBe("août 26");
  });
  it("disambiguates the same month across two different years", () => {
    const last = tooltipMonthLabel("2025-08");
    const current = tooltipMonthLabel("2026-08");
    expect(last).not.toBe(current);
    expect(last).toBe("août 25");
    expect(current).toBe("août 26");
  });
});

describe("monthOffsetLabel", () => {
  it("l'offset 0 est le mois courant", () => {
    expect(monthOffsetLabel(0, new Date(2026, 8, 15))).toBe("sept. 2026");
  });

  it("un offset positif atterrit sur le bon mois", () => {
    expect(monthOffsetLabel(14, new Date(2026, 8, 15))).toBe("nov. 2027");
  });

  it("fixe le jour au 1er avant d'ajouter les mois, pour que le 31 ne fasse pas rouler le mois", () => {
    // 31 janvier + 1 mois : sans le recadrage au 1er, `setMonth` roulerait
    // vers mars (28/29 jours en février) au lieu de rendre février.
    expect(monthOffsetLabel(1, new Date(2026, 0, 31))).toBe("févr. 2026");
  });
});

describe("localISO", () => {
  // Les dates sont construites avec des composantes LOCALES et relues en
  // local : ces tests ne dépendent donc pas du fuseau de la machine.
  it("rend la date civile de l'utilisateur, pas celle d'UTC", () => {
    // Le régression : à 00 h 30 le 1er septembre à Paris, il est encore le
    // 31 août à Greenwich. L'ancienne implémentation découpait
    // `toISOString()` et répondait donc « août » pendant les premières
    // heures de chaque mois — le sélecteur de mois, la carte « Tenue du
    // mois » et l'écran Dérive s'en trouvaient tous décalés d'un cran.
    expect(localISO(new Date(2026, 8, 1, 0, 30))).toBe("2026-09-01");
  });

  it("ne bascule pas non plus en fin de journée", () => {
    expect(localISO(new Date(2026, 8, 1, 23, 45))).toBe("2026-09-01");
  });

  it("complète le mois et le jour à deux chiffres", () => {
    expect(localISO(new Date(2026, 0, 5, 12, 0))).toBe("2026-01-05");
  });

  it("gère le dernier jour de l'année", () => {
    expect(localISO(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });

  it("gère le 29 février d'une année bissextile", () => {
    expect(localISO(new Date(2028, 1, 29, 6, 0))).toBe("2028-02-29");
  });
});

describe("todayISO / currentMonth", () => {
  it("todayISO is YYYY-MM-DD", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("todayISO rend la date locale du jour", () => {
    expect(todayISO()).toBe(localISO(new Date()));
  });
  it("currentMonth is YYYY-MM and is the prefix of todayISO", () => {
    expect(currentMonth()).toMatch(/^\d{4}-\d{2}$/);
    expect(todayISO().startsWith(currentMonth())).toBe(true);
  });
});
