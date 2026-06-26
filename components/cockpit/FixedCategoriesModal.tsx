"use client";

import { useState } from "react";
import { eur } from "@/lib/cockpit/format";
import { setCategoryFixed } from "@/lib/cockpit/categories-api";
import type { Category } from "@/lib/cockpit/types";
import type { CategoryInsight } from "@/lib/cockpit/categories-analysis";

export function FixedCategoriesModal({
  categories,
  insights,
  onClose,
  onSaved,
}: {
  categories: Category[];
  insights: CategoryInsight[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const spentBy: Record<string, number> = {};
  for (const i of insights) spentBy[i.categoryId] = i.total;
  const expense = categories
    .filter((c) => c.type === "expense")
    .sort((a, b) => (spentBy[b.id] ?? 0) - (spentBy[a.id] ?? 0));
  const [fixed, setFixed] = useState<Record<string, boolean>>(
    Object.fromEntries(expense.map((c) => [c.id, !!c.is_fixed]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fixeTotal = expense.reduce(
    (a, c) => a + (fixed[c.id] ? spentBy[c.id] ?? 0 : 0),
    0
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      for (const c of expense) {
        if (!!c.is_fixed !== !!fixed[c.id]) {
          await setCategoryFixed(c.id, !!fixed[c.id]);
        }
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
        <header className="flex justify-between items-center mb-1">
          <h2 className="font-display text-2xl">Charges fixes</h2>
          <button className="text-ink-muted text-sm" onClick={onClose} type="button">
            Fermer
          </button>
        </header>
        <p className="text-[12px] text-ink-muted mb-4">
          Coche les catégories incompressibles. Fixe ce mois :{" "}
          <span className="font-mono-num">{eur(fixeTotal)}</span>
        </p>
        <form onSubmit={submit} className="grid gap-1">
          {expense.map((c) => (
            <label
              key={c.id}
              className="flex items-center justify-between gap-3 py-2 border-b border-rule"
            >
              <span className="min-w-0">
                <span className="text-sm">{c.name}</span>
                <span className="block text-[11px] text-ink-muted font-mono-num">
                  {eur(spentBy[c.id] ?? 0)} ce mois
                </span>
              </span>
              <input
                type="checkbox"
                checked={!!fixed[c.id]}
                onChange={(e) =>
                  setFixed((f) => ({ ...f, [c.id]: e.target.checked }))
                }
                className="w-5 h-5 accent-emerald shrink-0"
              />
            </label>
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
