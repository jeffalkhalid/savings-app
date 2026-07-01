import { supabase } from "./supabase";
import type { CatType } from "./category-admin";

export async function setCategoryBudget(
  userId: string,
  categoryId: string,
  budget: number | null
): Promise<void> {
  if (budget === null) {
    const { error } = await supabase
      .from("category_budgets")
      .delete()
      .eq("user_id", userId)
      .eq("category_id", categoryId);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase
    .from("category_budgets")
    .upsert(
      { user_id: userId, category_id: categoryId, monthly_budget: budget },
      { onConflict: "user_id,category_id" }
    );
  if (error) throw new Error(error.message);
}

export async function setCategoryFixed(
  id: string,
  value: boolean
): Promise<void> {
  const { error } = await supabase
    .from("categories")
    .update({ is_fixed: value })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createCategory(
  userId: string | null,
  input: { name: string; type: CatType; color: string }
): Promise<void> {
  const { error } = await supabase.from("categories").insert({
    user_id: userId,
    name: input.name,
    type: input.type,
    color: input.color,
    active: true,
  });
  if (error) throw new Error(error.message);
}

export async function updateCategory(input: {
  id: string;
  name: string;
  color: string;
}): Promise<void> {
  const { error } = await supabase
    .from("categories")
    .update({ name: input.name, color: input.color })
    .eq("id", input.id);
  if (error) throw new Error(error.message);
}

export async function setCategoryActive(
  id: string,
  active: boolean
): Promise<void> {
  const { error } = await supabase
    .from("categories")
    .update({ active })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
