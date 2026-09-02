"use client";

import { AlertTriangle } from "lucide-react";
import { eur } from "@/lib/cockpit/format";
import { deletionTotals } from "@/lib/cockpit/bulk-select";
import type { Txn } from "@/lib/cockpit/types";

const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });

/**
 * Confirmation d'une suppression en masse.
 *
 * Les lignes sont listées, pas seulement comptées : c'est le dernier moment où
 * l'utilisateur peut voir qu'il a coché une ligne de trop, et un compteur seul
 * ne le lui montrerait pas.
 */
export function ConfirmDeleteSheet({
  txns,
  busy,
  onConfirm,
  onClose,
}: {
  txns: Txn[];
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { count, total } = deletionTotals(txns);

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/50 flex items-end justify-center"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="bg-paper w-full max-w-[600px] max-h-[80vh] overflow-auto px-6 pt-6 pb-10 rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-2 mb-1">
          <AlertTriangle size={18} className="text-accent shrink-0" />
          <h2 className="font-display text-xl">
            Supprimer {count} opération{count > 1 ? "s" : ""} ?
          </h2>
        </header>
        <p className="text-[12.5px] text-ink-muted mb-4">
          Définitif : l&apos;app ne garde pas de corbeille, il faudra les
          ressaisir.
        </p>

        <div className="mb-4">
          {txns.map((t) => {
            const amt = Number(t.amount);
            return (
              <div
                key={t.id}
                className="flex justify-between items-center gap-2.5 py-2 border-b border-rule"
              >
                <div className="min-w-0">
                  <div className="text-sm truncate">{t.description}</div>
                  <div className="text-[11.5px] text-ink-muted mt-0.5">
                    {fmtDate(t.date)}
                  </div>
                </div>
                <span
                  className={`font-mono-num text-sm shrink-0 ${
                    amt < 0 ? "text-accent" : "text-emerald"
                  }`}
                >
                  {eur(amt)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex justify-between items-center mb-5">
          <span className="text-[12.5px] text-ink-muted">Total</span>
          <span
            className={`font-mono-num text-base ${
              total < 0 ? "text-accent" : "text-emerald"
            }`}
          >
            {eur(total)}
          </span>
        </div>

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
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 bg-accent text-paper rounded-lg py-3 text-[13px] font-semibold disabled:opacity-50"
          >
            {busy ? "Suppression…" : "Supprimer"}
          </button>
        </div>
      </div>
    </div>
  );
}
