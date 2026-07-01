import { supabase } from "./supabase";
import { DEFAULT_ACCOUNTS, needsSeed } from "./defaults";

// Insère les comptes par défaut manquants (les catégories viennent désormais de
// la base commune partagée, plus de seed par-personne). RLS scope au user courant.
// Renvoie true si quelque chose a été inséré.
export async function ensureSeed(userId: string): Promise<boolean> {
  let seeded = false;

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
