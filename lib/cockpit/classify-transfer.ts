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

// Match sur frontière de mot (\b) pour éviter les faux positifs de sous-chaîne
// (ex. "REMBOURSEMENT" ne doit pas matcher "bourse", "PEAGE" ne matche pas "pea").
function matchesAny(normalized: string, keywords: string[]): boolean {
  const re = new RegExp(`\\b(${keywords.map((k) => normalize(k)).join("|")})\\b`);
  return re.test(normalized);
}

export function classifyTransfer(amount: number, label: string): TransferClass {
  if (Number(amount) >= 0) return "income";
  return matchesAny(normalize(label), SAVINGS_KEYWORDS) ? "savings" : "expense";
}

export function targetCategoryName(cls: TransferClass, label: string): string {
  if (cls === "income") return "Virements reçus";
  if (cls === "expense") return "Virements émis";
  return matchesAny(normalize(label), INVEST_KEYWORDS)
    ? "Bourse / Natixis"
    : "Épargne";
}
