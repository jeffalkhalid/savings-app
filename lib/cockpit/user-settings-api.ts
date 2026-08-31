import { supabase } from "./supabase";
import type { UserSettingsRow } from "./settings";
import type { AbondementBareme } from "@/lib/abondement";
import type { SalaryShift } from "@/lib/cockpit/budget-month";

export async function getUserSettings(
  userId: string
): Promise<UserSettingsRow | null> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("savings_rate_goal,reporting_currency,abondement_bareme,salary_shift")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as UserSettingsRow) ?? null;
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

/**
 * N'écrit que la colonne du barème : les autres colonnes gardent leur valeur
 * (ou leur défaut SQL si la ligne n'existe pas encore).
 */
export async function saveAbondementBareme(
  userId: string,
  bareme: AbondementBareme
): Promise<void> {
  const { error } = await supabase.from("user_settings").upsert(
    { user_id: userId, abondement_bareme: bareme },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(error.message);
}

/**
 * N'écrit que la colonne du rattachement : les autres colonnes gardent leur
 * valeur (ou leur défaut SQL si la ligne n'existe pas encore).
 */
export async function saveSalaryShift(
  userId: string,
  shift: SalaryShift
): Promise<void> {
  const { error } = await supabase.from("user_settings").upsert(
    { user_id: userId, salary_shift: shift },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(error.message);
}
