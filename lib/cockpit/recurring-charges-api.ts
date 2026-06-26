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
