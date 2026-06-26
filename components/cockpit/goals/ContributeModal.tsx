"use client";

import { useState } from "react";
import { contributeToGoal } from "@/lib/cockpit/goals-api";
import { eur } from "@/lib/cockpit/format";
import type { Goal } from "@/lib/cockpit/goals";

export function ContributeModal({
  goal,
  onClose,
  onSaved,
}: {
  goal: Goal;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const field = "border border-rule rounded-lg px-3 py-3 bg-white text-base w-full";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const a = parseFloat(amount.replace(",", "."));
    if (!isFinite(a) || a === 0) {
      setError("Montant invalide");
      return;
    }
    setSaving(true);
    try {
      await contributeToGoal(goal.id, Number(goal.current_amount) + a);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/50 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="bg-paper w-full max-w-[600px] px-6 pt-6 pb-10 rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-center mb-4">
          <h2 className="font-display text-2xl">Contribuer</h2>
          <button className="text-ink-muted text-sm" onClick={onClose} type="button">
            Annuler
          </button>
        </header>
        <p className="text-sm text-ink-muted mb-3">
          {goal.name} · {eur(goal.current_amount)} / {eur(goal.target_amount)}
        </p>
        <form onSubmit={submit} className="grid gap-3">
          <label className="grid gap-1.5 text-[13px] text-ink-muted">
            Montant à ajouter (€)
            <input
              className={field}
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              required
            />
          </label>
          <button
            className="bg-emerald text-[#FBF3EC] rounded-lg py-3.5 font-semibold disabled:opacity-60"
            type="submit"
            disabled={saving}
          >
            {saving ? "…" : "Ajouter"}
          </button>
          {error && <p className="text-accent text-sm">{error}</p>}
        </form>
      </div>
    </div>
  );
}
