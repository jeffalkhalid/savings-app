import {
  DEFAULT_BAREME,
  parseBareme,
  type AbondementBareme,
} from "@/lib/abondement";

export type UserSettings = {
  savings_rate_goal: number;
  reporting_currency: string;
  abondement_bareme: AbondementBareme;
};

/** Ligne brute telle qu'elle sort de Postgres (JSONB non typé). */
export type UserSettingsRow = {
  savings_rate_goal?: unknown;
  reporting_currency?: unknown;
  abondement_bareme?: unknown;
};

export const DEFAULT_SETTINGS: UserSettings = {
  savings_rate_goal: 0.2,
  reporting_currency: "EUR",
  abondement_bareme: DEFAULT_BAREME,
};

export const CURRENCIES: string[] = ["EUR", "USD", "GBP", "CHF", "CAD"];

export function coerceSettings(
  row: UserSettingsRow | null | undefined
): UserSettings {
  if (!row)
    return { ...DEFAULT_SETTINGS, abondement_bareme: parseBareme(null) };
  const goal = Number(row.savings_rate_goal);
  const ccy = row.reporting_currency;
  return {
    savings_rate_goal:
      isFinite(goal) && goal > 0 ? goal : DEFAULT_SETTINGS.savings_rate_goal,
    reporting_currency:
      typeof ccy === "string" && ccy.trim()
        ? ccy
        : DEFAULT_SETTINGS.reporting_currency,
    abondement_bareme: parseBareme(row.abondement_bareme),
  };
}
