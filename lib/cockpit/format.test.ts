import { describe, it, expect } from "vitest";
import {
  eur,
  todayISO,
  currentMonth,
  monthRange,
  axisMonthLabel,
  tooltipMonthLabel,
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

describe("todayISO / currentMonth", () => {
  it("todayISO is YYYY-MM-DD", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("currentMonth is YYYY-MM and is the prefix of todayISO", () => {
    expect(currentMonth()).toMatch(/^\d{4}-\d{2}$/);
    expect(todayISO().startsWith(currentMonth())).toBe(true);
  });
});
