import { supabase } from "./supabase";
import { signedAmount } from "./transactions";

export type TxnFields = {
  date: string;
  absAmount: number;
  description: string; // raw user input (may be empty)
  categoryId: string;
  categoryName: string;
  accountId: string;
  categoryType: string;
};

// Shared column mapping. description falls back to the category name;
// merchant keeps the raw user input (or null). Matches the original AddModal insert.
function row(f: TxnFields) {
  return {
    date: f.date,
    amount: signedAmount(f.absAmount, f.categoryType),
    description: f.description || f.categoryName,
    merchant: f.description || null,
    category_id: f.categoryId,
    account_id: f.accountId,
    type: f.categoryType,
  };
}

export async function createTransaction(
  userId: string,
  f: TxnFields
): Promise<void> {
  const { error } = await supabase.from("transactions").insert({
    user_id: userId,
    ...row(f),
    source: "manual",
  });
  if (error) throw new Error(error.message);
}

export async function updateTransaction(
  id: string,
  f: TxnFields
): Promise<void> {
  const { error } = await supabase
    .from("transactions")
    .update(row(f))
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
