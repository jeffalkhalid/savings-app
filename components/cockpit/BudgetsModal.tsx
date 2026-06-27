"use client";

import { useState } from "react";
import { setCategoryBudget } from "@/lib/cockpit/categories-api";
import type { Category } from "@/lib/cockpit/types";

export function BudgetsModal({
  categories,
  onClose,
  onSaved,
}: {
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const expense = categories
    .filter((c) => c.type === "expense")
    .sort((a, b) => a.name.localeCompare(b.name));
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(
      expense.map((c) => [
        c.id,
        c.monthly_budget != null ? String(c.monthly_budget) : "",
      ])
    )
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const field =
    "border border-rule rounded-lg px-3 py-2 bg-card text-ink text-base w-28 text-right";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      for (const c of expense) {
        const raw = (values[c.id] ?? "").trim();
        const next = raw ? parseFloat(raw.replace(",", ".")) : null;
        if (next !== null && !isFinite(next)) {
          setError(`Budget invalide : ${c.name}`);
          setSaving(false);
          return;
        }
        const prev = c.monthly_budget != null ? Number(c.monthly_budget) : null;
        if (next !== prev) await setCategoryBudget(c.id, next);
      }
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
          <h2 className="font-display text-2xl">Budgets mensuels</h2>
          <button className="text-ink-muted text-sm" onClick={onClose} type="button">
            Annuler
          </button>
        </header>
        <form onSubmit={submit} className="grid gap-2">
          {expense.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 py-1"
            >
              <span className="text-sm truncate">{c.name}</span>
              <input
                className={field}
                type="text"
                inputMode="decimal"
                placeholder="—"
                value={values[c.id] ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [c.id]: e.target.value }))
                }
              />
            </div>
          ))}
          {!expense.length && (
            <p className="text-ink-muted text-sm py-4">
              Aucune catégorie de dépense.
            </p>
          )}
          <button
            className="bg-emerald text-[#FBF3EC] rounded-lg py-3.5 font-semibold disabled:opacity-60 mt-3"
            type="submit"
            disabled={saving}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
          {error && <p className="text-accent text-sm">{error}</p>}
        </form>
      </div>
    </div>
  );
}
