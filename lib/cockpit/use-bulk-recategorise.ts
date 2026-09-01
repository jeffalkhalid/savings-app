"use client";

import { useState } from "react";
import type { Category, Txn } from "./types";
import { updateTransactionsCategory } from "./transactions-api";
import { setCategoryRules } from "./category-rules-api";
import { rulesFromTxns, bulkSummary } from "./bulk-select";

/**
 * Reclassement en masse, partagé par le Cockpit et la fiche commerçant.
 *
 * `onDone` est appelé après chaque tentative, réussie ou non : la base a pu
 * changer même sur le chemin d'erreur, donc l'appelant doit recharger.
 */
export function useBulkRecategorise(userId: string, onDone: () => void) {
  const [pending, setPending] = useState<Txn[] | null>(null);
  const [note, setNote] = useState("");
  const [noteIsError, setNoteIsError] = useState(false);

  const apply = async (categoryName: string, categories: Category[]) => {
    const picked = pending ?? [];
    const cat = categories.find((c) => c.name === categoryName);
    setPending(null);
    if (!cat || !picked.length) return;
    setNoteIsError(false);
    let moved = false;
    try {
      await updateTransactionsCategory(
        picked.map((t) => t.id),
        cat.id,
        cat.type
      );
      moved = true;
      const newRules = rulesFromTxns(picked, cat.id);
      await setCategoryRules(userId, newRules);
      setNote(bulkSummary(picked.length, newRules.length, cat.name));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      // Distinguer les deux échecs : si les opérations sont déjà reclassées,
      // le dire, sinon l'utilisateur croit que rien n'a bougé et recommence.
      setNote(
        moved
          ? `Opérations reclassées, mais la règle n'a pas pu être enregistrée : ${msg}`
          : msg
      );
      setNoteIsError(true);
    } finally {
      onDone();
    }
  };

  return {
    pending,
    note,
    noteIsError,
    start: (txns: Txn[]) => setPending(txns),
    cancel: () => setPending(null),
    apply,
  };
}
