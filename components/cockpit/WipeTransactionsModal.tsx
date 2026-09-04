"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { deleteAllTransactions } from "@/lib/cockpit/transactions-api";

/** Le mot à saisir pour confirmer. Volontairement pas « oui ». */
const CONFIRM_WORD = "SUPPRIMER";

/**
 * Vidage de toutes les opérations.
 *
 * La suppression en masse ordinaire liste les lignes concernées : c'est le
 * dernier moment où l'on voit qu'on en a cochée une de trop. Ici il y en a des
 * milliers, donc cette garantie-là est impossible. Elle est remplacée par deux
 * autres : le compte exact, et un mot à taper — sur une action irréversible qui
 * emporte tout, le geste doit coûter davantage qu'un appui.
 *
 * La liste de ce qui survit n'est pas décorative : c'est elle qui permet
 * d'appuyer en connaissance de cause plutôt qu'en espérant.
 */
export function WipeTransactionsModal({
  userId,
  count,
  onWiped,
  onClose,
}: {
  userId: string;
  count: number;
  onWiped: () => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const armed = typed.trim().toUpperCase() === CONFIRM_WORD;

  const wipe = async () => {
    if (!armed || busy) return;
    setBusy(true);
    setError("");
    try {
      await deleteAllTransactions(userId);
      onWiped();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1100] bg-black/50 flex items-end justify-center"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="bg-paper w-full max-w-[600px] max-h-[85vh] overflow-auto px-6 pt-6 pb-10 rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-2 mb-1">
          <AlertTriangle size={18} className="text-accent shrink-0" />
          <h2 className="font-display text-xl">Vider toutes les opérations</h2>
        </header>
        <p className="text-[12.5px] text-ink-muted mb-4">
          <span className="font-mono-num text-ink">{count}</span> opération
          {count > 1 ? "s" : ""} seront supprimées. Définitif :
          l&apos;app ne garde pas de corbeille, il faudra réimporter.
        </p>

        <div className="bg-card rounded-xl p-3 mb-4">
          <div className="text-[11px] uppercase tracking-wide text-ink-muted mb-1.5">
            Ce qui est conservé
          </div>
          <ul className="text-[12.5px] text-ink-muted grid gap-0.5">
            <li>Tes règles de classement — un réimport reclassera tout seul.</li>
            <li>Tes engagements, catégories et budgets.</li>
            <li>Tes objectifs et ton patrimoine.</li>
          </ul>
          <p className="text-[11.5px] text-ink-muted mt-2 pt-2 border-t border-rule">
            La progression de tes objectifs retombera à zéro : elle est calculée
            depuis les opérations.
          </p>
        </div>

        <label className="grid gap-1.5 text-[13px] text-ink-muted mb-4">
          Tape <span className="font-mono-num text-ink">{CONFIRM_WORD}</span>{" "}
          pour confirmer
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={busy}
            autoComplete="off"
            className="bg-tile rounded-lg px-3 py-2.5 text-ink text-[15px] outline-none disabled:opacity-50"
          />
        </label>

        {error && <p className="text-accent text-[12.5px] mb-3">{error}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 bg-seg text-ink rounded-lg py-3 text-[13px] font-semibold disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={wipe}
            disabled={!armed || busy}
            className="flex-1 bg-accent text-paper rounded-lg py-3 text-[13px] font-semibold disabled:opacity-40"
          >
            {busy ? "Suppression…" : "Tout supprimer"}
          </button>
        </div>
      </div>
    </div>
  );
}
