import type { Txn } from "./types";

function normalize(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function filterTxns(
  txns: Txn[],
  query: string,
  categoryId?: string | null
): Txn[] {
  const q = normalize(query.trim());
  const cat = categoryId && categoryId !== "all" ? categoryId : null;
  return txns.filter((t) => {
    if (cat && t.category_id !== cat) return false;
    if (q && !normalize(t.description).includes(q)) return false;
    return true;
  });
}
