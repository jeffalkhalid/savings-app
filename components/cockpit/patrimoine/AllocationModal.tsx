"use client";

import { useState } from "react";
import { saveAllocationTargets } from "@/lib/cockpit/allocation-api";
import { ALLOCATION_TYPES, targetsTotal } from "@/lib/cockpit/allocation";
import { typeLabel } from "@/lib/cockpit/patrimoine";

export function AllocationModal({
  userId,
  targets,
  onClose,
  onSaved,
}: {
  userId: string;
  targets: Record<string, number>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(
      ALLOCATION_TYPES.map((t) => [t, targets[t] ? String(targets[t]) : ""])
    )
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const field = "border border-rule rounded-lg px-3 py-2 bg-white text-base w-24 text-right";

  const parsed: Record<string, number> = {};
  for (const t of ALLOCATION_TYPES) {
    const raw = (values[t] ?? "").trim();
    parsed[t] = raw ? parseFloat(raw.replace(",", ".")) : 0;
  }
  const sum = targetsTotal(parsed);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    for (const t of ALLOCATION_TYPES) {
      if (!isFinite(parsed[t]) || parsed[t] < 0) {
        setError(`Valeur invalide : ${typeLabel(t)}`);
        return;
      }
    }
    setSaving(true);
    try {
      await saveAllocationTargets(userId, parsed);
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
          <h2 className="font-display text-2xl">Allocation cible</h2>
          <button className="text-ink-muted text-sm" onClick={onClose} type="button">
            Annuler
          </button>
        </header>
        <form onSubmit={submit} className="grid gap-2">
          {ALLOCATION_TYPES.map((t) => (
            <div key={t} className="flex items-center justify-between gap-3 py-1">
              <span className="text-sm">{typeLabel(t)}</span>
              <div className="flex items-center gap-1">
                <input
                  className={field}
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={values[t] ?? ""}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [t]: e.target.value }))
                  }
                />
                <span className="text-ink-muted text-sm">%</span>
              </div>
            </div>
          ))}
          <div
            className={`text-[12px] mt-1 ${
              sum === 100 ? "text-ink-muted" : "text-accent"
            }`}
          >
            Somme : {Math.round(sum)}%{sum !== 100 ? " (≠ 100 %)" : ""}
          </div>
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
