import { describe, it, expect } from "vitest";
import { DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS, needsSeed } from "./defaults";

describe("DEFAULT_CATEGORIES", () => {
  it("is non-empty", () => {
    expect(DEFAULT_CATEGORIES.length).toBeGreaterThan(0);
  });
  it("only uses valid types", () => {
    const valid = new Set(["income", "expense", "transfer", "savings"]);
    for (const c of DEFAULT_CATEGORIES) expect(valid.has(c.type)).toBe(true);
  });
  it("has unique names", () => {
    const names = DEFAULT_CATEGORIES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
  it("covers each type at least once", () => {
    const types = new Set(DEFAULT_CATEGORIES.map((c) => c.type));
    expect(types.has("income")).toBe(true);
    expect(types.has("expense")).toBe(true);
    expect(types.has("transfer")).toBe(true);
    expect(types.has("savings")).toBe(true);
  });
});

describe("DEFAULT_ACCOUNTS", () => {
  it("is non-empty", () => {
    expect(DEFAULT_ACCOUNTS.length).toBeGreaterThan(0);
  });
});

describe("needsSeed", () => {
  it("is true for an empty list", () => {
    expect(needsSeed([])).toBe(true);
  });
  it("is false when categories exist", () => {
    expect(needsSeed([{ id: "x" }])).toBe(false);
  });
});
