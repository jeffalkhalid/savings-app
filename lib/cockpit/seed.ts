import { supabase } from "./supabase";
import { DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS, needsSeed } from "./defaults";

// Insère les catégories/comptes par défaut manquants. Catégories et comptes
// sont sondés indépendamment : si l'un échoue, l'autre est re-tenté à la
// prochaine connexion (pas de gap), sans doublon (chaque insert est gardé par
// sa propre sonde vide). RLS scope les lignes au user courant.
// Renvoie true si quelque chose a été inséré.
export async function ensureSeed(userId: string): Promise<boolean> {
  let seeded = false;

  const { data: cats, error: catSelErr } = await supabase
    .from("categories")
    .select("id")
    .limit(1);
  if (catSelErr) throw new Error(catSelErr.message);
  if (needsSeed((cats as { id: string }[]) ?? [])) {
    const { error } = await supabase.from("categories").insert(
      DEFAULT_CATEGORIES.map((c) => ({
        user_id: userId,
        name: c.name,
        type: c.type,
        color: c.color,
      }))
    );
    if (error) throw new Error(error.message);
    seeded = true;
  }

  const { data: accs, error: accSelErr } = await supabase
    .from("accounts")
    .select("id")
    .limit(1);
  if (accSelErr) throw new Error(accSelErr.message);
  if (needsSeed((accs as { id: string }[]) ?? [])) {
    const { error } = await supabase.from("accounts").insert(
      DEFAULT_ACCOUNTS.map((a) => ({
        user_id: userId,
        name: a.name,
        type: a.type,
        institution: "(à préciser)",
        currency: "EUR",
      }))
    );
    if (error) throw new Error(error.message);
    seeded = true;
  }

  return seeded;
}
