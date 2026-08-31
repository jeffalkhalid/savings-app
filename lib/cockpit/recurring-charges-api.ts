import { supabase } from "./supabase";

export type RecurringCharge = {
  id: string;
  payee_key: string;
  label: string;
  expected_amount: number;
  active: boolean;
};

export async function createRecurringCharge(
  userId: string,
  f: { payeeKey: string; label: string; expectedAmount: number }
): Promise<void> {
  const { error } = await supabase.from("recurring_charges").upsert(
    {
      user_id: userId,
      payee_key: f.payeeKey,
      label: f.label,
      expected_amount: f.expectedAmount,
      active: true,
    },
    { onConflict: "user_id,payee_key" }
  );
  if (error) throw new Error(error.message);
}

export async function updateRecurringCharge(
  id: string,
  f: { label: string; expectedAmount: number; active: boolean }
): Promise<void> {
  const { error } = await supabase
    .from("recurring_charges")
    .update({
      label: f.label,
      expected_amount: f.expectedAmount,
      active: f.active,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteRecurringCharge(id: string): Promise<void> {
  const { error } = await supabase
    .from("recurring_charges")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Ligne complète, y compris les charges inactives et created_at : pour la re-clé. */
export type RecurringChargeRow = {
  id: string;
  payee_key: string;
  label: string;
  expected_amount: number;
  created_at: string;
  active: boolean;
};

export async function listAllRecurringCharges(
  userId: string
): Promise<RecurringChargeRow[]> {
  const { data, error } = await supabase
    .from("recurring_charges")
    .select("id,payee_key,label,expected_amount,created_at,active")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as RecurringChargeRow[]) ?? [];
}

export async function updateRecurringChargeKey(
  id: string,
  payeeKey: string
): Promise<void> {
  const { error } = await supabase
    .from("recurring_charges")
    .update({ payee_key: payeeKey })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteRecurringCharges(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase
    .from("recurring_charges")
    .delete()
    .in("id", ids);
  if (error) throw new Error(error.message);
}
