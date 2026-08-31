import { supabase } from "./supabase";

export type CategoryRule = { payee_key: string; category_id: string };

export async function getCategoryRules(
  userId: string
): Promise<CategoryRule[]> {
  const { data, error } = await supabase
    .from("category_rules")
    .select("payee_key,category_id")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data as CategoryRule[]) ?? [];
}

export async function setCategoryRule(
  userId: string,
  payeeKey: string,
  categoryId: string
): Promise<void> {
  const { error } = await supabase.from("category_rules").upsert(
    { user_id: userId, payee_key: payeeKey, category_id: categoryId },
    { onConflict: "user_id,payee_key" }
  );
  if (error) throw new Error(error.message);
}

/** Écriture en lot : une seule requête pour toute une sélection. */
export async function setCategoryRules(
  userId: string,
  rules: { payeeKey: string; categoryId: string }[]
): Promise<void> {
  if (!rules.length) return;
  const { error } = await supabase.from("category_rules").upsert(
    rules.map((r) => ({
      user_id: userId,
      payee_key: r.payeeKey,
      category_id: r.categoryId,
    })),
    { onConflict: "user_id,payee_key" }
  );
  if (error) throw new Error(error.message);
}

export async function deleteCategoryRule(
  userId: string,
  payeeKey: string
): Promise<void> {
  const { error } = await supabase
    .from("category_rules")
    .delete()
    .eq("user_id", userId)
    .eq("payee_key", payeeKey);
  if (error) throw new Error(error.message);
}
