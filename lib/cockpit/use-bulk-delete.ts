"use client";

import { useState } from "react";
import type { Txn } from "./types";
import { deleteTransactions } from "./transactions-api";
import { deleteSummary } from "./bulk-select";

/**
 * Suppression en masse, partagée par le Cockpit et la fiche commerçant.
 *
 * Même contrat que `useBulkRecategorise`, pour la même raison : deux écrans
 * qui suppriment de deux façons finissent par diverger. `onDone` est appelé
 * après chaque tentative, réussie ou non — la suppression part par lots, donc
 * un échec au troisième lot laisse les deux premiers supprimés et l'appelant
 * doit recharger quoi qu'il arrive.
 *
 * Il n'y a pas d'annulation : l'app n'a pas de suppression douce, la ligne
 * part pour de bon. C'est la confirmation qui protège, rien d'autre.
 */
export function useBulkDelete(onDone: () => void) {
  const [pending, setPending] = useState<Txn[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [noteIsError, setNoteIsError] = useState(false);

  const confirm = async () => {
    const picked = pending ?? [];
    if (!picked.length) {
      setPending(null);
      return;
    }
    setBusy(true);
    setNoteIsError(false);
    try {
      await deleteTransactions(picked.map((t) => t.id));
      setNote(deleteSummary(picked.length));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      // Le nombre supprimé avant l'échec est inconnu ici : le dire est plus
      // honnête que d'annoncer un échec total que la base contredit déjà.
      setNote(`Suppression interrompue : ${msg}. Recharge pour voir l'état réel.`);
      setNoteIsError(true);
    } finally {
      setBusy(false);
      setPending(null);
      onDone();
    }
  };

  return {
    pending,
    busy,
    note,
    noteIsError,
    start: (txns: Txn[]) => setPending(txns),
    cancel: () => setPending(null),
    confirm,
  };
}
