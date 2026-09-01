/** Taille de page : Supabase plafonne les réponses à 1000 lignes par défaut. */
export const PAGE_SIZE = 1000;

/**
 * Découpe un total en plages `from`/`to` **inclusives**, la convention de
 * `.range()` côté Supabase.
 */
export function pageRanges(
  total: number,
  size: number
): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  for (let from = 0; from < total; from += size) {
    out.push({ from, to: Math.min(from + size, total) - 1 });
  }
  return out;
}
