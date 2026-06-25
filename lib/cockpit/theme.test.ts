import { describe, it, expect } from "vitest";
import { resolveInitialTheme, nextTheme } from "./theme";

describe("resolveInitialTheme", () => {
  it("uses the stored value when explicit", () => {
    expect(resolveInitialTheme("dark", false)).toBe("dark");
    expect(resolveInitialTheme("light", true)).toBe("light");
  });
  it("falls back to the system preference when not stored", () => {
    expect(resolveInitialTheme(null, true)).toBe("dark");
    expect(resolveInitialTheme(null, false)).toBe("light");
  });
  it("falls back to the system preference when stored is unknown", () => {
    expect(resolveInitialTheme("", true)).toBe("dark");
    expect(resolveInitialTheme("bogus", false)).toBe("light");
  });
});

describe("nextTheme", () => {
  it("toggles", () => {
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("light");
  });
});
