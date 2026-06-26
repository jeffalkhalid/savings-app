import { supabase } from "./supabase";
import type { UserSettings } from "./settings";

export async function getUserSettings(
  userId: string
): Promise<UserSettings | null> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("savings_rate_goal,reporting_currency")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as UserSettings) ?? null;
}

export async function saveUserSettings(
  userId: string,
  s: { savingsRateGoal: number; reportingCurrency: string }
): Promise<void> {
  const { error } = await supabase.from("user_settings").upsert(
    {
      user_id: userId,
      savings_rate_goal: s.savingsRateGoal,
      reporting_currency: s.reportingCurrency,
    },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(error.message);
}
