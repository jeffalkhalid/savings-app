export const CATEGORY_COLORS = [
  "#B45342",
  "#C75B39",
  "#B89968",
  "#E3B23C",
  "#3E7D5A",
  "#4F8B82",
  "#4A6FA5",
  "#836FB2",
  "#C62828",
  "#6B6E76",
];

export type CatType = "income" | "expense" | "transfer" | "savings";

export const CAT_TYPE_LABELS: Record<CatType, string> = {
  expense: "Dépenses",
  income: "Revenus",
  savings: "Épargne",
  transfer: "Virements",
};

export const CAT_TYPE_ORDER: CatType[] = [
  "expense",
  "income",
  "savings",
  "transfer",
];

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Erreur de validation d'un nom, ou null si valide.
// existingNames = noms des catégories ACTIVES (hors la catégorie éditée).
export function categoryNameError(
  name: string,
  existingNames: string[]
): string | null {
  if (!name.trim()) return "Nom requis";
  const n = norm(name);
  if (existingNames.some((e) => norm(e) === n)) return "Ce nom existe déjà";
  return null;
}

export function splitCategories<T extends { user_id?: string | null }>(
  categories: T[],
  myUserId: string
): { common: T[]; mine: T[] } {
  const common = categories.filter((c) => c.user_id == null);
  const mine = categories.filter(
    (c) => c.user_id != null && c.user_id === myUserId
  );
  return { common, mine };
}
