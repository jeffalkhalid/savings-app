import type { Txn } from "./types";

// Virements à classer : transactions type=transfer, triées par date décroissante.
export function pendingTransfers(txns: Txn[]): Txn[] {
  return txns
    .filter((t) => t.type === "transfer")
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}
