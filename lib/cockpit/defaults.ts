export type SeedCategory = {
  name: string;
  type: "income" | "expense" | "transfer" | "savings";
  color: string;
};

export type SeedAccount = { name: string; type: string };

export const DEFAULT_CATEGORIES: SeedCategory[] = [
  { name: "Salaire", type: "income", color: "#1B5E40" },
  { name: "Revenus divers", type: "income", color: "#2D7A4F" },
  { name: "Logement", type: "expense", color: "#B45342" },
  { name: "Courses alimentaires", type: "expense", color: "#B89968" },
  { name: "Restaurants & Sorties", type: "expense", color: "#836FB2" },
  { name: "Transport", type: "expense", color: "#4A6FA5" },
  { name: "Énergie", type: "expense", color: "#B45342" },
  { name: "Téléphonie & Internet", type: "expense", color: "#4F8B82" },
  { name: "Assurance", type: "expense", color: "#6B6E76" },
  { name: "Santé", type: "expense", color: "#C62828" },
  { name: "Loisirs", type: "expense", color: "#836FB2" },
  { name: "Vêtements", type: "expense", color: "#B89968" },
  { name: "Frais bancaires", type: "expense", color: "#6B6E76" },
  { name: "Virements", type: "transfer", color: "#0288D1" },
  { name: "Épargne", type: "savings", color: "#1B5E40" },
  { name: "Investissements", type: "savings", color: "#2D7A4F" },
];

// type ∈ contrainte CHECK de la table accounts : current/savings/investment/work_savings/commodity.
export const DEFAULT_ACCOUNTS: SeedAccount[] = [
  { name: "Compte courant", type: "current" },
  { name: "Livret épargne", type: "savings" },
];

// Un utilisateur a besoin du seed s'il n'a aucune catégorie.
export function needsSeed(categories: { id: string }[]): boolean {
  return categories.length === 0;
}
