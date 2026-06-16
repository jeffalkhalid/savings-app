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

export type ImportRow = {
  date: string; // ISO
  amount: number; // signé brut (préservé tel quel)
  description: string;
  categoryId: string;
  type: string;
  accountId: string;
};

// Insert en masse. Préserve le montant signé (ne repasse PAS par signedAmount).
export async function createTransactionsBulk(
  userId: string,
  rows: ImportRow[]
): Promise<void> {
  if (!rows.length) return;
  const { error } = await supabase.from("transactions").insert(
    rows.map((r) => ({
      user_id: userId,
      date: r.date,
      amount: r.amount,
      description: r.description,
      merchant: r.description || null,
      category_id: r.categoryId,
      account_id: r.accountId,
      type: r.type,
      source: "import",
    }))
  );
  if (error) throw new Error(error.message);
}
