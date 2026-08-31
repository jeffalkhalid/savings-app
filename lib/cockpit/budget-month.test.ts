import { describe, it, expect } from "vitest";
import {
  budgetMonthOf,
  daysInMonth,
  DEFAULT_SHIFT,
  isShifted,
  nextMonth,
  parseSalaryShift,
  shiftWindowStart,
} from "./budget-month";
import type { Txn } from "./types";

const SHIFT = {
  payeeKeys: ["carrefour france"],
  categoryIds: ["cat-salaire"],
  days: 4,
};

const salaire = (date: string, over: Partial<Txn> = {}): Txn => ({
  id: "1",
  date,
  amount: 3200,
  description:
    "VIR SEPA RECU /DE CARREFOUR FRANCE /MOTIF  /REF CARREFOUR 1961870275237171845034602",
  type: "income",
  category_id: "cat-salaire",
  ...over,
});

describe("daysInMonth", () => {
  it("compte les jours réels du mois", () => {
    expect(daysInMonth("2026-08")).toBe(31);
    expect(daysInMonth("2026-04")).toBe(30);
    expect(daysInMonth("2026-02")).toBe(28);
  });
  it("gère les années bissextiles", () => {
    expect(daysInMonth("2028-02")).toBe(29);
  });
});

describe("nextMonth", () => {
  it("avance d'un mois", () => {
    expect(nextMonth("2026-08")).toBe("2026-09");
  });
  it("passe l'année en décembre", () => {
    expect(nextMonth("2026-12")).toBe("2027-01");
  });
});

describe("shiftWindowStart", () => {
  it("donne le premier jour du mois précédent qui peut basculer", () => {
    // août a 31 jours, fenêtre de 4 → 28, 29, 30, 31
    expect(shiftWindowStart("2026-09", 4)).toBe("2026-08-28");
  });
  it("s'adapte à un mois de 30 jours", () => {
    expect(shiftWindowStart("2026-05", 4)).toBe("2026-04-27");
  });
  it("s'adapte à février", () => {
    expect(shiftWindowStart("2026-03", 4)).toBe("2026-02-25");
  });
  it("recule d'une année depuis janvier", () => {
    expect(shiftWindowStart("2027-01", 4)).toBe("2026-12-28");
  });
});

describe("isShifted — les quatre conditions", () => {
  it("bascule quand les quatre sont réunies", () => {
    expect(isShifted(salaire("2026-08-29"), SHIFT)).toBe(true);
  });
  it("ne bascule pas hors de la fenêtre", () => {
    expect(isShifted(salaire("2026-08-27"), SHIFT)).toBe(false);
  });
  it("ne bascule pas si le payeur ne correspond pas", () => {
    const t = salaire("2026-08-29", {
      description: "VIR SEPA RECU /DE AUTRE EMPLOYEUR /REF X",
    });
    expect(isShifted(t, SHIFT)).toBe(false);
  });
  it("ne bascule pas si la catégorie ne correspond pas", () => {
    expect(isShifted(salaire("2026-08-29", { category_id: "cat-autre" }), SHIFT)).toBe(false);
  });
  it("ne bascule pas sans catégorie", () => {
    expect(isShifted(salaire("2026-08-29", { category_id: null }), SHIFT)).toBe(false);
  });
  it("ne bascule pas si le type n'est pas income", () => {
    expect(isShifted(salaire("2026-08-29", { type: "expense" }), SHIFT)).toBe(false);
  });
  it("prend le dernier jour du mois", () => {
    expect(isShifted(salaire("2026-08-31"), SHIFT)).toBe(true);
  });
  it("prend le premier jour de la fenêtre", () => {
    expect(isShifted(salaire("2026-08-28"), SHIFT)).toBe(true);
  });
  it("ajuste la fenêtre sur un mois court", () => {
    // février 2026 : 28 jours, fenêtre de 4 → 25, 26, 27, 28
    expect(isShifted(salaire("2026-02-25"), SHIFT)).toBe(true);
    expect(isShifted(salaire("2026-02-24"), SHIFT)).toBe(false);
  });
});

describe("isShifted — configuration vide", () => {
  it("ne déplace jamais rien avec DEFAULT_SHIFT", () => {
    expect(isShifted(salaire("2026-08-29"), DEFAULT_SHIFT)).toBe(false);
    expect(isShifted(salaire("2026-08-31"), DEFAULT_SHIFT)).toBe(false);
  });
  it("ne déplace rien si seule la liste de payeurs est remplie", () => {
    const s = { payeeKeys: ["carrefour france"], categoryIds: [], days: 4 };
    expect(isShifted(salaire("2026-08-29"), s)).toBe(false);
  });
  it("ne déplace rien si seule la liste de catégories est remplie", () => {
    const s = { payeeKeys: [], categoryIds: ["cat-salaire"], days: 4 };
    expect(isShifted(salaire("2026-08-29"), s)).toBe(false);
  });
});

describe("budgetMonthOf", () => {
  it("renvoie le mois suivant pour une ligne qui bascule", () => {
    expect(budgetMonthOf(salaire("2026-08-29"), SHIFT)).toBe("2026-09");
  });
  it("renvoie le mois de la date sinon", () => {
    expect(budgetMonthOf(salaire("2026-08-15"), SHIFT)).toBe("2026-08");
  });
  it("passe l'année en décembre", () => {
    expect(budgetMonthOf(salaire("2026-12-30"), SHIFT)).toBe("2027-01");
  });
  it("ne bouge rien avec la configuration par défaut", () => {
    expect(budgetMonthOf(salaire("2026-08-29"), DEFAULT_SHIFT)).toBe("2026-08");
  });
});

describe("partition — aucune transaction perdue ni comptée deux fois", () => {
  it("range chaque transaction dans exactement un mois budgétaire", () => {
    const txns: Txn[] = [
      salaire("2026-07-31"),        // → août
      salaire("2026-08-15", { id: "2" }), // → août (hors fenêtre)
      salaire("2026-08-29", { id: "3" }), // → septembre
      salaire("2026-09-30", { id: "4" }), // → octobre
    ];
    const months = txns.map((t) => budgetMonthOf(t, SHIFT));
    expect(months).toEqual(["2026-08", "2026-08", "2026-09", "2026-10"]);
    expect(new Set(txns.map((t) => t.id)).size).toBe(4);
  });
});

describe("parseSalaryShift", () => {
  it("retombe sur le défaut pour null ou undefined", () => {
    expect(parseSalaryShift(null)).toEqual(DEFAULT_SHIFT);
    expect(parseSalaryShift(undefined)).toEqual(DEFAULT_SHIFT);
  });
  it("retombe sur le défaut pour un objet étranger", () => {
    expect(parseSalaryShift({ hello: "world" })).toEqual(DEFAULT_SHIFT);
    expect(parseSalaryShift("nope")).toEqual(DEFAULT_SHIFT);
    expect(parseSalaryShift(42)).toEqual(DEFAULT_SHIFT);
  });
  it("conserve une configuration valide", () => {
    const s = { payeeKeys: ["carrefour france"], categoryIds: ["c1"], days: 4 };
    expect(parseSalaryShift(s)).toEqual(s);
  });
  it("ignore les entrées non textuelles des listes", () => {
    const s = { payeeKeys: ["ok", 3, null], categoryIds: ["c1"], days: 4 };
    expect(parseSalaryShift(s).payeeKeys).toEqual(["ok"]);
  });
  it("borne days entre 1 et 15", () => {
    expect(parseSalaryShift({ payeeKeys: [], categoryIds: [], days: 0 }).days).toBe(4);
    expect(parseSalaryShift({ payeeKeys: [], categoryIds: [], days: 99 }).days).toBe(4);
    expect(parseSalaryShift({ payeeKeys: [], categoryIds: [], days: 7 }).days).toBe(7);
  });
  it("renvoie une copie, pas la constante partagée", () => {
    const parsed = parseSalaryShift(null);
    parsed.payeeKeys.push("x");
    expect(DEFAULT_SHIFT.payeeKeys).toHaveLength(0);
  });
});
