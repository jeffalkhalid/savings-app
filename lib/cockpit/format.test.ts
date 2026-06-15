import { describe, it, expect } from "vitest";
import { eur, todayISO, currentMonth, monthRange } from "./format";

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

describe("todayISO / currentMonth", () => {
  it("todayISO is YYYY-MM-DD", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("currentMonth is YYYY-MM and is the prefix of todayISO", () => {
    expect(currentMonth()).toMatch(/^\d{4}-\d{2}$/);
    expect(todayISO().startsWith(currentMonth())).toBe(true);
  });
});
