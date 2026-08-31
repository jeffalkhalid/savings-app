export type ParsedRow = {
  date: string; // ISO YYYY-MM-DD
  label: string;
  amount: number; // signé
  bnpCategory: string;
  bnpSubCategory: string;
  shortLabel: string;
  operationType: string;
};

export type ReviewRow = ParsedRow & {
  categoryName: string;
  duplicate: boolean;
};

const norm = (s: string): string => (s ?? "").trim().toLowerCase();

const BY_SUBCATEGORY: Record<string, string> = {
  "virement émis": "Virements",
  "virement reçu": "Virements",
  "téléphone": "Téléphonie",
  "électricité, gaz": "Énergie",
  "assurances": "Assurance",
  "sport": "Sport & Bien-être",
  "habillement": "Vêtements & Hygiène",
  "coiffeur, cosmétique, soins": "Vêtements & Hygiène",
  "achats, shopping": "Courses alimentaires",
  "salaire": "Salaire",
  "loisirs et sorties - autres": "Loisirs & Streaming",
};

const BY_CATEGORY: Record<string, string> = {
  revenus: "Salaire",
  logement: "Logement",
  "abonnements et telephonie": "Téléphonie",
  "loisirs et sorties": "Loisirs & Streaming",
  "vie quotidienne": "Courses alimentaires",
  "autres dépenses": "Imprévus & Santé",
  "à catégoriser": "Virements",
  transport: "Transport",
};

const DEFAULT_CATEGORY = "Imprévus & Santé";

export function mapBnpCategory(category: string, subCategory: string): string {
  return (
    BY_SUBCATEGORY[norm(subCategory)] ??
    BY_CATEGORY[norm(category)] ??
    DEFAULT_CATEGORY
  );
}

function toISODate(s: string): string {
  const m = String(s).trim().match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

function toAmount(s: string): number {
  return parseFloat(String(s).replace(/\s/g, "").replace(",", "."));
}

type ColumnIndex = {
  date: number;
  label: number;
  amount: number;
  bnpCategory: number;
  bnpSubCategory: number;
  shortLabel: number;
  operationType: number;
};

/** Repère les colonnes par leur en-tête, pour survivre aux changements de format BNP. */
function findColumns(header: string[]): ColumnIndex | null {
  const at = (pred: (h: string) => boolean): number =>
    header.findIndex((c) => pred(norm(c)));

  const cols: ColumnIndex = {
    date: at((h) => h === "date operation"),
    label: at((h) => h === "libelle operation"),
    amount: at((h) => h.startsWith("montant operation")),
    bnpCategory: at((h) => h === "categorie operation"),
    bnpSubCategory: at((h) => h === "sous categorie operation"),
    shortLabel: at((h) => h === "libelle court"),
    operationType: at((h) => h === "type operation"),
  };
  if (cols.date === -1 || cols.label === -1 || cols.amount === -1) return null;
  return cols;
}

const cell = (r: string[], i: number): string =>
  i >= 0 ? String(r[i] ?? "").trim() : "";

export function parseBnpSheet(rows: string[][]): ParsedRow[] {
  const headerIdx = rows.findIndex(
    (r) => Array.isArray(r) && r.some((c) => norm(c) === "date operation")
  );
  if (headerIdx === -1) return [];

  const cols = findColumns(rows[headerIdx]);
  if (!cols) return [];

  const out: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r)) continue;
    const date = toISODate(cell(r, cols.date));
    const amount = toAmount(cell(r, cols.amount));
    if (!date || !isFinite(amount)) continue;
    out.push({
      date,
      label: cell(r, cols.label),
      amount,
      bnpCategory: cell(r, cols.bnpCategory),
      bnpSubCategory: cell(r, cols.bnpSubCategory),
      shortLabel: cell(r, cols.shortLabel),
      operationType: cell(r, cols.operationType),
    });
  }
  return out;
}

export function rowKey(dateISO: string, amount: number): string {
  // Number() normalise les deux côtés (montant parsé vs amount numeric de la DB
  // renvoyé en string par PostgREST) pour que le dédoublonnage ne casse pas.
  return `${dateISO}|${Number(amount)}`;
}

export function markDuplicates(
  rows: ParsedRow[],
  existingKeys: Set<string>
): ReviewRow[] {
  return rows.map((r) => ({
    ...r,
    categoryName: mapBnpCategory(r.bnpCategory, r.bnpSubCategory),
    duplicate: existingKeys.has(rowKey(r.date, r.amount)),
  }));
}
