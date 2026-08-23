import { describe, it, expect } from "vitest";
import { coerceSettings, DEFAULT_SETTINGS } from "./settings";
import { DEFAULT_BAREME } from "@/lib/abondement";

describe("coerceSettings", () => {
  it("returns defaults for null", () => {
    expect(coerceSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
  it("keeps a complete row", () => {
    const out = coerceSettings({
      savings_rate_goal: 0.3,
      reporting_currency: "USD",
    });
    expect(out.savings_rate_goal).toBe(0.3);
    expect(out.reporting_currency).toBe("USD");
  });
  it("fills missing/invalid fields with defaults", () => {
    expect(coerceSettings({ reporting_currency: "" }).savings_rate_goal).toBe(0.2);
    expect(coerceSettings({ reporting_currency: "" }).reporting_currency).toBe("EUR");
    expect(coerceSettings({ savings_rate_goal: 0 }).savings_rate_goal).toBe(0.2);
  });

  it("retombe sur le barème par défaut quand la colonne est vide", () => {
    expect(coerceSettings(null).abondement_bareme).toEqual(DEFAULT_BAREME);
    expect(
      coerceSettings({ reporting_currency: "EUR" }).abondement_bareme
    ).toEqual(DEFAULT_BAREME);
  });

  it("lit le barème personnalisé de la colonne JSONB", () => {
    const custom = {
      peg: { interessement: [], participation: [], volontaire: [{ upTo: null, rate: 0.5 }] },
      per: { interessement: [], participation: [], volontaire: [] },
    };
    expect(
      coerceSettings({ reporting_currency: "EUR", abondement_bareme: custom })
        .abondement_bareme
    ).toEqual(custom);
  });
});
