import { describe, it, expect } from "vitest";
import { coerceSettings, DEFAULT_SETTINGS } from "./settings";

describe("coerceSettings", () => {
  it("returns defaults for null", () => {
    expect(coerceSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
  it("keeps a complete row", () => {
    expect(
      coerceSettings({ savings_rate_goal: 0.3, reporting_currency: "USD" })
    ).toEqual({ savings_rate_goal: 0.3, reporting_currency: "USD" });
  });
  it("fills missing/invalid fields with defaults", () => {
    expect(coerceSettings({ reporting_currency: "" }).savings_rate_goal).toBe(0.2);
    expect(coerceSettings({ reporting_currency: "" }).reporting_currency).toBe("EUR");
    expect(coerceSettings({ savings_rate_goal: 0 }).savings_rate_goal).toBe(0.2);
  });
});
