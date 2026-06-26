"use client";

import { useEffect, useState } from "react";
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from "@/lib/cockpit/transactions-api";
import { todayISO } from "@/lib/cockpit/format";
import type { Category, Account, Txn } from "@/lib/cockpit/types";
import type { Goal } from "@/lib/cockpit/goals";

export function TxnModal({
  userId,
  categories,
  accounts,
  goals,
  txn,
  onClose,
  onSaved,
}: {
  userId: string;
  categories: Category[];
  accounts: Account[];
  goals: Goal[];
  txn: Txn | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!txn;
  const [date, setDate] = useState(txn?.date ?? todayISO());
  const [amount, setAmount] = useState(
    txn ? String(Math.abs(Number(txn.amount))) : ""
  );
  const [description, setDescription] = useState(txn?.description ?? "");
  const [categoryId, setCategoryId] = useState(
    txn?.category_id ?? categories[0]?.id ?? ""
  );
  const [accountId, setAccountId] = useState(
    txn?.account_id ??
      accounts.find((a) => a.name.includes("BNP"))?.id ??
      accounts[0]?.id ??
      ""
  );
  const [goalId, setGoalId] = useState(txn?.goal_id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Création : les listes chargent en async ; on seede les selects à leur arrivée
  // si encore vides. (Le chemin édition seede toujours depuis txn.)
  useEffect(() => {
    if (!txn && !categoryId && categories.length) setCategoryId(categories[0].id);
  }, [txn, categories, categoryId]);
  useEffect(() => {
    if (!txn && !accountId && accounts.length) {
      setAccountId(
        accounts.find((a) => a.name.includes("BNP"))?.id ?? accounts[0].id
      );
    }
  }, [txn, accounts, accountId]);

  const fieldCls = "border border-rule rounded-lg px-3 py-3 bg-white text-base w-full";
  const labelCls = "grid gap-1.5 text-[13px] text-ink-muted";

  const isSavings =
    categories.find((c) => c.id === categoryId)?.type === "savings";

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
    const fields = {
      date,
      absAmount: amt,
      description: description.trim(),
      categoryId,
      categoryName: cat.name,
      accountId,
      categoryType: cat.type,
      goalId: cat.type === "savings" ? goalId || null : null,
    };
    setSaving(true);
    try {
      if (editing && txn) await updateTransaction(txn.id, fields);
      else await createTransaction(userId, fields);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!txn) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setError("");
    setSaving(true);
    try {
      await deleteTransaction(txn.id);
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
            {editing ? "Modifier la transaction" : "Nouvelle transaction"}
          </h2>
          <button className="text-ink-muted text-sm" onClick={onClose} type="button">
            Annuler
          </button>
        </header>
        <form onSubmit={save} className="grid gap-3">
          <label className={labelCls}>
            Montant (€)
            <input
              className={fieldCls}
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
              className={fieldCls}
              type="text"
              placeholder="Ex. Carrefour, Uber, café…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className={labelCls}>
            Catégorie
            <select
              className={fieldCls}
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
          {isSavings && (
            <label className={labelCls}>
              Objectif (optionnel)
              <select
                className={fieldCls}
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
              >
                <option value="">Aucun (épargne libre)</option>
                {goals.map((gl) => (
                  <option key={gl.id} value={gl.id}>
                    {gl.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className={labelCls}>
            Compte
            <select
              className={fieldCls}
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
              className={fieldCls}
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
          {editing && (
            <button
              type="button"
              onClick={remove}
              disabled={saving}
              className="text-strat-a text-sm py-2"
            >
              {confirmDelete ? "Confirmer la suppression" : "Supprimer"}
            </button>
          )}
          {error && <p className="text-strat-a text-sm">{error}</p>}
        </form>
      </div>
    </div>
  );
}
