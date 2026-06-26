import { describe, it, expect } from "vitest";
import { normalizePref, resolveTheme, nextTheme } from "./theme";

describe("normalizePref", () => {
  it("keeps valid prefs", () => {
    expect(normalizePref("light")).toBe("light");
    expect(normalizePref("dark")).toBe("dark");
    expect(normalizePref("system")).toBe("system");
  });
  it("defaults unknown/null to system", () => {
    expect(normalizePref(null)).toBe("system");
    expect(normalizePref("")).toBe("system");
    expect(normalizePref("bogus")).toBe("system");
  });
});

describe("resolveTheme", () => {
  it("follows the OS when system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
  it("uses the explicit pref otherwise", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });
});

describe("nextTheme", () => {
  it("toggles", () => {
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("light");
  });
});
