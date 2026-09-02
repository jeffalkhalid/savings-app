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
 * Sur un succès, la feuille se ferme et un résumé s'affiche sur la page. Sur
 * un échec, la feuille reste ouverte et porte l'erreur elle-même : c'est le
 * seul endroit garanti visible (le résumé de la page peut être hors écran sur
 * une longue liste), et c'est l'utilisateur qui la ferme, une fois qu'il l'a
 * lue — la liste, elle, a déjà été rechargée par `onDone()`.
 *
 * Il n'y a pas d'annulation : l'app n'a pas de suppression douce, la ligne
 * part pour de bon. C'est la confirmation qui protège, rien d'autre.
 */
export function useBulkDelete(onDone: () => void) {
  const [pending, setPending] = useState<Txn[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    const picked = pending ?? [];
    if (!picked.length) {
      setPending(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteTransactions(picked.map((t) => t.id));
      setNote(deleteSummary(picked.length));
      setPending(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      // Le nombre supprimé avant l'échec est inconnu ici : le dire est plus
      // honnête que d'annoncer un échec total que la base contredit déjà.
      // `pending` reste posé : la feuille reste ouverte pour porter ce
      // message, faute de quoi rien ne l'affiche là où l'utilisateur regarde.
      setError(`Suppression interrompue : ${msg}. Recharge pour voir l'état réel.`);
    } finally {
      setBusy(false);
      onDone();
    }
  };

  return {
    pending,
    busy,
    note,
    error,
    start: (txns: Txn[]) => setPending(txns),
    cancel: () => {
      setPending(null);
      setError(null);
    },
    confirm,
  };
}
