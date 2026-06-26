"use client";

import { useState } from "react";
import { eur } from "@/lib/cockpit/format";
import {
  createRecurringCharge,
  updateRecurringCharge,
  deleteRecurringCharge,
  type RecurringCharge,
} from "@/lib/cockpit/recurring-charges-api";
import type { RecurringCandidate } from "@/lib/cockpit/recurring-detect";
import type { ChargeMatch, ChargeStatus } from "@/lib/cockpit/recurring-match";

const STATUS: Record<ChargeStatus, { label: string; cls: string }> = {
  paye: { label: "payé", cls: "text-emerald" },
  a_venir: { label: "à venir", cls: "text-ink-muted" },
  hausse: { label: "en hausse", cls: "text-accent" },
  baisse: { label: "en baisse", cls: "text-emerald" },
};

export function EngagementsModal({
  userId,
  charges,
  matches,
  candidates,
  onClose,
  onChanged,
}: {
  userId: string;
  charges: RecurringCharge[];
  matches: ChargeMatch[];
  candidates: RecurringCandidate[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>(
    Object.fromEntries(
      charges.map((c) => [c.id, String(Math.round(c.expected_amount))])
    )
  );
  const matchOf = (key: string) => matches.find((m) => m.payeeKey === key);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/50 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="bg-paper w-full max-w-[600px] max-h-[90vh] overflow-auto px-6 pt-6 pb-10 rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-center mb-4">
          <h2 className="font-display text-2xl">Engagements récurrents</h2>
          <button className="text-ink-muted text-sm" onClick={onClose} type="button">
            Fermer
          </button>
        </header>

        {charges.length > 0 && (
          <div className="mb-5">
            <div className="font-display text-[15px] mb-2">Mes engagements</div>
            {charges.map((c) => {
              const m = matchOf(c.payee_key);
              const st = m ? STATUS[m.status] : STATUS.a_venir;
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 py-2 border-b border-rule"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{c.label}</div>
                    <div className="text-[11px] mt-0.5">
                      <span className={st.cls}>{st.label}</span>
                      {m?.driftPct != null && Math.abs(m.driftPct) > 0.15 && (
                        <span className="text-accent font-mono-num">
                          {" · "}
                          {m.driftPct >= 0 ? "+" : ""}
                          {Math.round(m.driftPct * 100)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      className="border border-rule rounded-lg px-2 py-1.5 bg-white text-sm w-20 text-right font-mono-num"
                      type="text"
                      inputMode="decimal"
                      value={edits[c.id] ?? ""}
                      onChange={(e) =>
                        setEdits((x) => ({ ...x, [c.id]: e.target.value }))
                      }
                      onBlur={() => {
                        const v = parseFloat((edits[c.id] || "").replace(",", "."));
                        if (isFinite(v) && v > 0 && v !== c.expected_amount) {
                          run(() =>
                            updateRecurringCharge(c.id, {
                              label: c.label,
                              expectedAmount: v,
                              active: c.active,
                            })
                          );
                        }
                      }}
                    />
                    <span className="text-ink-muted text-xs">€</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(() => deleteRecurringCharge(c.id))}
                      className="text-ink-muted text-lg px-1"
                      aria-label="Retirer"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div>
          <div className="font-display text-[15px] mb-2">Détectés</div>
          {!candidates.length && (
            <p className="text-ink-muted text-sm py-2">
              Pas de nouvelle charge récurrente détectée.
            </p>
          )}
          {candidates.map((cand) => (
            <div
              key={cand.payeeKey}
              className="flex items-center gap-3 py-2 border-b border-rule"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{cand.label}</div>
                <div className="text-[11px] text-ink-muted">
                  ~{eur(cand.expected)}/mois · {cand.monthsSeen} mois
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    createRecurringCharge(userId, {
                      payeeKey: cand.payeeKey,
                      label: cand.label,
                      expectedAmount: cand.expected,
                    })
                  )
                }
                className="shrink-0 text-[12px] font-semibold bg-emerald text-[#FBF3EC] rounded-lg px-3 py-1.5"
              >
                Confirmer
              </button>
            </div>
          ))}
        </div>

        {error && <p className="text-accent text-sm mt-3">{error}</p>}
      </div>
    </div>
  );
}
