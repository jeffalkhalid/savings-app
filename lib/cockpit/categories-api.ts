import { supabase } from "./supabase";

export async function setCategoryBudget(
  id: string,
  budget: number | null
): Promise<void> {
  const { error } = await supabase
    .from("categories")
    .update({ monthly_budget: budget })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
