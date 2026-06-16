import { describe, it, expect } from "vitest";
import { signedAmount } from "./transactions";

describe("signedAmount", () => {
  it("keeps income positive", () => {
    expect(signedAmount(100, "income")).toBe(100);
  });
  it("makes expense negative", () => {
    expect(signedAmount(100, "expense")).toBe(-100);
  });
  it("makes transfer and savings negative", () => {
    expect(signedAmount(50, "transfer")).toBe(-50);
    expect(signedAmount(50, "savings")).toBe(-50);
  });
  it("normalizes a negative input via Math.abs", () => {
    expect(signedAmount(-100, "income")).toBe(100);
    expect(signedAmount(-100, "expense")).toBe(-100);
  });
});
