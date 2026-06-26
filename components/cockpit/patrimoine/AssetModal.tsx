"use client";

import { useState } from "react";
import { createAsset, updateAsset, deleteAsset } from "@/lib/cockpit/patrimoine-api";
import { todayISO } from "@/lib/cockpit/format";
import type { Account } from "@/lib/cockpit/types";
import type { Asset } from "@/lib/cockpit/patrimoine";
import { CURRENCIES } from "@/lib/cockpit/settings";

const TYPES = [
  { v: "stock", label: "Actions (PEA, Natixis)" },
  { v: "savings", label: "Livrets" },
  { v: "cash", label: "Liquidités" },
  { v: "commodity", label: "Or / matières" },
];

export function AssetModal({
  userId,
  accounts,
  asset,
  onClose,
  onSaved,
}: {
  userId: string;
  accounts: Account[];
  asset: Asset | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!asset;
  const [name, setName] = useState(asset?.name ?? "");
  const [type, setType] = useState(asset?.type ?? "stock");
  const [accountId, setAccountId] = useState(asset?.account_id ?? accounts[0]?.id ?? "");
  const [currency, setCurrency] = useState(asset?.currency ?? "EUR");
  const [ticker, setTicker] = useState(asset?.ticker ?? "");
  const [quantity, setQuantity] = useState(
    asset?.quantity != null ? String(asset.quantity) : ""
  );
  const [initialValue, setInitialValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const field = "border border-rule rounded-lg px-3 py-3 bg-white text-base w-full";
  const labelCls = "grid gap-1.5 text-[13px] text-ink-muted";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Nom requis");
      return;
    }
    const qty = quantity.trim() ? parseFloat(quantity.replace(",", ".")) : null;
    setSaving(true);
    try {
      if (editing && asset) {
        await updateAsset({
          id: asset.id,
          name: name.trim(),
          type,
          accountId: accountId || null,
          ticker: ticker.trim() || null,
          quantity: qty,
          currency,
        });
      } else {
        const v = parseFloat(initialValue.replace(",", "."));
        if (!isFinite(v)) {
          setError("Valeur initiale invalide");
          setSaving(false);
          return;
        }
        await createAsset({
          userId,
          name: name.trim(),
          type,
          accountId: accountId || null,
          ticker: ticker.trim() || null,
          quantity: qty,
          currency,
          initialValue: v,
          date: todayISO(),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!asset) return;
    setError("");
    setSaving(true);
    try {
      await deleteAsset(asset.id);
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
            {editing ? "Modifier l'asset" : "Nouvel asset"}
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
          <label className={labelCls}>
            Type
            <select
              className={field}
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {TYPES.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Devise
            <select
              className={field}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Compte
            <select
              className={field}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">—</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Ticker (optionnel)
            <input
              className={field}
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
            />
          </label>
          <label className={labelCls}>
            Quantité (optionnel)
            <input
              className={field}
              type="text"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          {!editing && (
            <label className={labelCls}>
              Valeur actuelle (€)
              <input
                className={field}
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={initialValue}
                onChange={(e) => setInitialValue(e.target.value)}
                required
              />
            </label>
          )}
          <button
            className="bg-emerald text-paper rounded-lg py-3.5 font-semibold disabled:opacity-60"
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
              className="text-strat-a text-sm py-2"
            >
              Supprimer cet asset
            </button>
          )}
          {error && <p className="text-strat-a text-sm">{error}</p>}
        </form>
      </div>
    </div>
  );
}
