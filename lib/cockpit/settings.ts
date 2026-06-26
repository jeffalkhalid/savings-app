export type UserSettings = {
  savings_rate_goal: number;
  reporting_currency: string;
};

export const DEFAULT_SETTINGS: UserSettings = {
  savings_rate_goal: 0.2,
  reporting_currency: "EUR",
};

export const CURRENCIES: string[] = ["EUR", "USD", "GBP", "CHF", "CAD"];

export function coerceSettings(
  row: Partial<UserSettings> | null | undefined
): UserSettings {
  if (!row) return { ...DEFAULT_SETTINGS };
  const goal = Number(row.savings_rate_goal);
  const ccy = row.reporting_currency;
  return {
    savings_rate_goal:
      isFinite(goal) && goal > 0 ? goal : DEFAULT_SETTINGS.savings_rate_goal,
    reporting_currency:
      typeof ccy === "string" && ccy.trim()
        ? ccy
        : DEFAULT_SETTINGS.reporting_currency,
  };
}
