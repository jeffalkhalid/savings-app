export type TransferClass = "income" | "expense" | "savings";

export const SAVINGS_KEYWORDS = [
  "natixis",
  "bourse",
  "pea",
  "livret",
  "ldds",
  "or & argent",
  "épargne",
];

const INVEST_KEYWORDS = ["natixis", "bourse", "pea"];

function normalize(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function classifyTransfer(amount: number, label: string): TransferClass {
  if (Number(amount) >= 0) return "income";
  const n = normalize(label);
  const isSavings = SAVINGS_KEYWORDS.some((k) => n.includes(normalize(k)));
  return isSavings ? "savings" : "expense";
}

export function targetCategoryName(cls: TransferClass, label: string): string {
  if (cls === "income") return "Virements reçus";
  if (cls === "expense") return "Virements émis";
  const n = normalize(label);
  return INVEST_KEYWORDS.some((k) => n.includes(k))
    ? "Bourse / Natixis"
    : "Épargne";
}
