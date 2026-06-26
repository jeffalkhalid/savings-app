"use client";

import { useState } from "react";
import {
  createReminder,
  updateReminder,
  deleteReminder,
} from "@/lib/cockpit/reminders-api";
import { todayISO } from "@/lib/cockpit/format";
import type { Reminder } from "@/lib/cockpit/reminders";

export function ReminderModal({
  userId,
  reminder,
  onClose,
  onSaved,
}: {
  userId: string;
  reminder: Reminder | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!reminder;
  const [label, setLabel] = useState(reminder?.label ?? "");
  const [dueDate, setDueDate] = useState(reminder?.due_date ?? todayISO());
  const [amount, setAmount] = useState(
    reminder?.amount != null ? String(reminder.amount) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const field = "border border-rule rounded-lg px-3 py-3 bg-white text-base w-full";
  const labelCls = "grid gap-1.5 text-[13px] text-ink-muted";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!label.trim()) {
      setError("Libellé requis");
      return;
    }
    if (!dueDate) {
      setError("Échéance requise");
      return;
    }
    const amt = amount.trim() ? parseFloat(amount.replace(",", ".")) : null;
    if (amt !== null && !isFinite(amt)) {
      setError("Montant invalide");
      return;
    }
    setSaving(true);
    try {
      const fields = { label: label.trim(), dueDate, amount: amt };
      if (editing && reminder) await updateReminder(reminder.id, fields);
      else await createReminder(userId, fields);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!reminder) return;
    setError("");
    setSaving(true);
    try {
      await deleteReminder(reminder.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1001] bg-black/50 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="bg-paper w-full max-w-[600px] max-h-[90vh] overflow-auto px-6 pt-6 pb-10 rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-center mb-4">
          <h2 className="font-display text-2xl">
            {editing ? "Modifier le rappel" : "Nouveau rappel"}
          </h2>
          <button className="text-ink-muted text-sm" onClick={onClose} type="button">
            Annuler
          </button>
        </header>
        <form onSubmit={submit} className="grid gap-3">
          <label className={labelCls}>
            Libellé
            <input
              className={field}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
              required
            />
          </label>
          <label className={labelCls}>
            Échéance
            <input
              className={field}
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
          </label>
          <label className={labelCls}>
            Montant (optionnel)
            <input
              className={field}
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
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
              Supprimer ce rappel
            </button>
          )}
          {error && <p className="text-accent text-sm">{error}</p>}
        </form>
      </div>
    </div>
  );
}
