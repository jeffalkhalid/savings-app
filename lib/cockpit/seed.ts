import { supabase } from "./supabase";
import { DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS, needsSeed } from "./defaults";

// Insère les catégories/comptes par défaut si l'utilisateur n'a aucune catégorie.
// Renvoie true s'il a seedé, false sinon. RLS scope les lignes au user courant.
export async function ensureSeed(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from("categories").select("id").limit(1);
  if (error) throw new Error(error.message);
  if (!needsSeed((data as { id: string }[]) ?? [])) return false;

  const { error: catErr } = await supabase.from("categories").insert(
    DEFAULT_CATEGORIES.map((c) => ({
      user_id: userId,
      name: c.name,
      type: c.type,
      color: c.color,
    }))
  );
  if (catErr) throw new Error(catErr.message);

  const { error: accErr } = await supabase.from("accounts").insert(
    DEFAULT_ACCOUNTS.map((a) => ({
      user_id: userId,
      name: a.name,
      type: a.type,
      currency: "EUR",
    }))
  );
  if (accErr) throw new Error(accErr.message);

  return true;
}
