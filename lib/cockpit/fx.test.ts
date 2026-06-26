import { describe, it, expect } from "vitest";
import { convert, money } from "./fx";

const rates = { EUR: 1, USD: 1.1, GBP: 0.85 };

describe("convert", () => {
  it("converts EUR to USD", () => {
    expect(convert(100, "EUR", "USD", rates)).toBeCloseTo(110);
  });
  it("converts USD to GBP via EUR", () => {
    expect(convert(110, "USD", "GBP", rates)).toBeCloseTo(85);
  });
  it("leaves same-currency unchanged", () => {
    expect(convert(50, "USD", "USD", rates)).toBe(50);
  });
  it("uses factor 1 for an unknown currency", () => {
    expect(convert(50, "JPY", "EUR", rates)).toBe(50);
  });
});

describe("money", () => {
  it("formats with the given currency", () => {
    expect(money(1000, "USD")).toMatch(/\$|US/);
  });
});
