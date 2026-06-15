"use client";

import { useState } from "react";
import {
  addValuation,
  updateValuation,
  deleteValuation,
} from "@/lib/cockpit/patrimoine-api";
import { eur, todayISO } from "@/lib/cockpit/format";
import type { Asset, AssetValuation } from "@/lib/cockpit/patrimoine";

export function ValuationModal({
  userId,
  asset,
  valuations,
  onClose,
  onChanged,
  onEditAsset,
}: {
  userId: string;
  asset: Asset;
  valuations: AssetValuation[];
  onClose: () => void;
  onChanged: () => void;
  onEditAsset: () => void;
}) {
  const [date, setDate] = useState(todayISO());
  const [value, setValue] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const rows = [...valuations].sort((a, b) => (a.date < b.date ? 1 : -1));
  const field = "border border-rule rounded-lg px-3 py-3 bg-white text-base w-full";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const v = parseFloat(value.replace(",", "."));
    if (!isFinite(v)) {
      setError("Valeur invalide");
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await updateValuation({ id: editId, assetId: asset.id, date, value: v });
      } else {
        await addValuation({ userId, assetId: asset.id, date, value: v });
      }
      setValue("");
      setEditId(null);
      setDate(todayISO());
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
    setSaving(false);
  };

  const startEdit = (val: AssetValuation) => {
    setEditId(val.id);
    setDate(val.date);
    setValue(String(val.value));
  };

  const remove = async (val: AssetValuation) => {
    setError("");
    setSaving(true);
    try {
      await deleteValuation({ id: val.id, assetId: asset.id });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
    setSaving(false);
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
          <h2 className="font-display text-2xl">{asset.name}</h2>
          <div className="flex items-center gap-3">
            <button
              className="text-ink-muted text-sm"
              onClick={onEditAsset}
              type="button"
            >
              Modifier la ligne
            </button>
            <button className="text-ink-muted text-sm" onClick={onClose} type="button">
              Fermer
            </button>
          </div>
        </header>

        <form
          onSubmit={submit}
          className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end mb-5"
        >
          <label className="grid gap-1.5 text-[13px] text-ink-muted">
            Date
            <input
              className={field}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
          <label className="grid gap-1.5 text-[13px] text-ink-muted">
            Valeur (€)
            <input
              className={field}
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
            />
          </label>
          <button
            className="bg-emerald text-paper rounded-lg py-3 px-4 font-semibold disabled:opacity-60"
            type="submit"
            disabled={saving}
          >
            {editId ? "OK" : "+"}
          </button>
        </form>
        {error && <p className="text-strat-a text-sm mb-3">{error}</p>}

        <div className="text-xs uppercase tracking-[0.1em] text-ink-muted mb-2">
          Historique
        </div>
        {!rows.length && (
          <p className="text-ink-muted text-sm py-2">Aucune valuation.</p>
        )}
        {rows.map((val) => (
          <div
            key={val.id}
            className="flex justify-between items-center py-2 border-b border-rule"
          >
            <div className="font-mono-num text-sm">{val.date}</div>
            <div className="flex items-center gap-3">
              <span className="font-mono-num text-sm">{eur(Number(val.value))}</span>
              <button
                type="button"
                onClick={() => startEdit(val)}
                className="text-ink-muted text-xs"
              >
                Éditer
              </button>
              <button
                type="button"
                onClick={() => remove(val)}
                className="text-strat-a text-xs"
              >
                Suppr.
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
