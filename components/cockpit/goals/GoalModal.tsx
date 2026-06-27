"use client";

import { useState } from "react";
import { createGoal, updateGoal, deleteGoal } from "@/lib/cockpit/goals-api";
import { goalIcon, GOAL_ICONS } from "@/lib/cockpit/goal-icon";
import type { Goal } from "@/lib/cockpit/goals";

export function GoalModal({
  userId,
  goal,
  onClose,
  onSaved,
}: {
  userId: string;
  goal: Goal | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!goal;
  const [name, setName] = useState(goal?.name ?? "");
  const [icon, setIcon] = useState(goal?.icon ?? "target");
  const [target, setTarget] = useState(goal ? String(goal.target_amount) : "");
  const [deadline, setDeadline] = useState(goal?.deadline ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const field = "border border-rule rounded-lg px-3 py-3 bg-card text-ink text-base w-full";
  const labelCls = "grid gap-1.5 text-[13px] text-ink-muted";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Nom requis");
      return;
    }
    const t = parseFloat(target.replace(",", "."));
    if (!isFinite(t) || t <= 0) {
      setError("Cible invalide");
      return;
    }
    setSaving(true);
    try {
      const fields = {
        name: name.trim(),
        icon,
        targetAmount: t,
        deadline: deadline || null,
      };
      if (editing && goal) await updateGoal(goal.id, fields);
      else await createGoal(userId, fields);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!goal) return;
    setError("");
    setSaving(true);
    try {
      await deleteGoal(goal.id);
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
        className="bg-paper w-full max-w-[600px] max-h-[90vh] overflow-auto px-6 pt-6 pb-10 rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-center mb-4">
          <h2 className="font-display text-2xl">
            {editing ? "Modifier l'objectif" : "Nouvel objectif"}
          </h2>
          <button className="text-ink-muted text-sm" onClick={onClose} type="button">
            Annuler
          </button>
        </header>
        <form onSubmit={submit} className="grid gap-3">
          <label className={labelCls}>
            Nom
            <input
              className={field}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </label>
          <div className={labelCls}>
            Icône
            <div className="grid grid-cols-6 gap-2">
              {GOAL_ICONS.map((k) => {
                const Ic = goalIcon(k);
                const on = k === icon;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setIcon(k)}
                    className={`aspect-square rounded-xl flex items-center justify-center border ${
                      on ? "border-emerald bg-tile" : "border-rule"
                    }`}
                  >
                    <Ic size={18} className={on ? "text-emerald" : "text-ink-muted"} />
                  </button>
                );
              })}
            </div>
          </div>
          <label className={labelCls}>
            Montant cible (€)
            <input
              className={field}
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              required
            />
          </label>
          <label className={labelCls}>
            Échéance (optionnel)
            <input
              className={field}
              type="date"
              value={deadline ?? ""}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </label>
          <button
            className="bg-emerald text-[#FBF3EC] rounded-lg py-3.5 font-semibold disabled:opacity-60"
            type="submit"
            disabled={saving}
          >
            {saving ? "Enregistrement…" : editing ? "Enregistrer" : "Créer"}
          </button>
          {editing && (
            <button
              type="button"
              onClick={remove}
              disabled={saving}
              className="text-accent text-sm py-2"
            >
              Supprimer cet objectif
            </button>
          )}
          {error && <p className="text-accent text-sm">{error}</p>}
        </form>
      </div>
    </div>
  );
}
