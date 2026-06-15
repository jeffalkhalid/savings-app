"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/cockpit/supabase";
import { todayISO } from "@/lib/cockpit/format";
import type { Category, Account } from "@/lib/cockpit/types";

export function AddModal({
  userId,
  categories,
  accounts,
  onClose,
  onSaved,
}: {
  userId: string;
  categories: Category[];
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [accountId, setAccountId] = useState(
    accounts.find((a) => a.name.includes("BNP"))?.id ?? accounts[0]?.id ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Lists load asynchronously; seed the selects once they arrive if still empty.
  useEffect(() => {
    if (!categoryId && categories.length) setCategoryId(categories[0].id);
  }, [categories, categoryId]);
  useEffect(() => {
    if (!accountId && accounts.length) {
      setAccountId(
        accounts.find((a) => a.name.includes("BNP"))?.id ?? accounts[0].id
      );
    }
  }, [accounts, accountId]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) {
      setError("Catégorie requise");
      return;
    }
    const amt = parseFloat(amount.replace(",", "."));
    if (!isFinite(amt) || amt <= 0) {
      setError("Montant invalide");
      return;
    }
    const sign = cat.type === "income" ? 1 : -1;

    setSaving(true);
    const { error: e2 } = await supabase.from("transactions").insert({
      user_id: userId,
      date,
      amount: sign * amt,
      description: description || cat.name,
      merchant: description || null,
      category_id: categoryId,
      account_id: accountId,
      type: cat.type,
      source: "manual",
    });
    setSaving(false);
    if (e2) {
      setError(e2.message);
      return;
    }
    onSaved();
  };

  const field =
    "border border-rule rounded-lg px-3 py-3 bg-white text-base w-full";
  const labelCls = "grid gap-1.5 text-[13px] text-ink-muted";

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
          <h2 className="font-display text-2xl">Nouvelle transaction</h2>
          <button
            className="text-ink-muted text-sm"
            onClick={onClose}
            type="button"
          >
            Annuler
          </button>
        </header>
        <form onSubmit={save} className="grid gap-3">
          <label className={labelCls}>
            Montant (€)
            <input
              className={field}
              type="text"
              inputMode="decimal"
              autoFocus
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </label>
          <label className={labelCls}>
            Description
            <input
              className={field}
              type="text"
              placeholder="Ex. Carrefour, Uber, café…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className={labelCls}>
            Catégorie
            <select
              className={field}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.type})
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
              required
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Date
            <input
              className={field}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
          <button
            className="bg-emerald text-paper rounded-lg py-3.5 font-semibold disabled:opacity-60"
            type="submit"
            disabled={saving}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
          {error && <p className="text-strat-a text-sm">{error}</p>}
        </form>
      </div>
    </div>
  );
}
