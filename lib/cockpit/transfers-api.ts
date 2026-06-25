import { supabase } from "./supabase";
import { updateTransaction } from "./transactions-api";
import { classifyTransfer, targetCategoryName } from "./classify-transfer";
import { pendingTransfers } from "./transfers";
import type { Txn, Category } from "./types";

const TRANSFER_CATEGORIES: { name: string; type: string }[] = [
  { name: "Virements reçus", type: "income" },
  { name: "Virements émis", type: "expense" },
];

// Crée les catégories Virements reçus/émis si absentes ; renvoie la liste à jour.
export async function ensureTransferCategories(
  userId: string,
  categories: Category[]
): Promise<Category[]> {
  const missing = TRANSFER_CATEGORIES.filter(
    (tc) => !categories.some((c) => c.name === tc.name)
  );
  if (!missing.length) return categories;
  const { data, error } = await supabase
    .from("categories")
    .insert(
      missing.map((m) => ({
        user_id: userId,
        name: m.name,
        type: m.type,
        color: "#6B6E76",
      }))
    )
    .select("id,name,type,color");
  if (error) throw new Error(error.message);
  return [...categories, ...((data as Category[]) ?? [])];
}

// Classe toutes les transactions type=transfer via la règle (updateTransaction).
// `categories` doit contenir les cibles (appeler ensureTransferCategories avant).
// Renvoie le nombre de lignes traitées (cibles non résolues ignorées).
export async function classifyAllTransfers(
  txns: Txn[],
  categories: Category[]
): Promise<number> {
  let count = 0;
  for (const t of pendingTransfers(txns)) {
    const cls = classifyTransfer(Number(t.amount), t.description);
    const name = targetCategoryName(cls, t.description);
    const cat = categories.find((c) => c.name === name);
    if (!cat) continue;
    await updateTransaction(t.id, {
      date: t.date,
      absAmount: Math.abs(Number(t.amount)),
      description: t.description,
      categoryId: cat.id,
      categoryName: cat.name,
      accountId: t.account_id ?? "",
      categoryType: cat.type,
    });
    count++;
  }
  return count;
}
