"use client";

import { eur } from "@/lib/cockpit/format";
import {
  activeReminders,
  reminderStatus,
  dueLabel,
  type Reminder,
} from "@/lib/cockpit/reminders";
import { Bell, Plus, Check } from "lucide-react";

const STATUS_CLS: Record<string, string> = {
  overdue: "text-accent",
  today: "text-gold",
  upcoming: "text-ink-muted",
  done: "text-ink-muted",
};

export function RemindersModal({
  reminders,
  today,
  onAdd,
  onEdit,
  onToggleDone,
  onClose,
}: {
  reminders: Reminder[];
  today: string;
  onAdd: () => void;
  onEdit: (r: Reminder) => void;
  onToggleDone: (r: Reminder) => void;
  onClose: () => void;
}) {
  const list = activeReminders(reminders);
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
          <h2 className="font-display text-2xl">Rappels</h2>
          <button className="text-ink-muted text-sm" onClick={onClose} type="button">
            Fermer
          </button>
        </header>

        {!list.length && (
          <div className="text-center py-8 text-ink-muted">
            <Bell size={28} className="mx-auto mb-1.5" />
            <div className="text-sm font-semibold text-ink">Aucun rappel</div>
            <div className="text-xs mt-0.5">Ajoute un pense-bête.</div>
          </div>
        )}

        {list.map((r) => {
          const st = reminderStatus(r, today);
          return (
            <div
              key={r.id}
              className="flex items-center gap-3 py-2.5 border-b border-rule"
            >
              <Bell size={18} className={STATUS_CLS[st]} />
              <button
                type="button"
                onClick={() => onEdit(r)}
                className="flex-1 min-w-0 text-left"
              >
                <div className="text-sm truncate">{r.label}</div>
                <div className="text-[11.5px] text-ink-muted mt-0.5">
                  {dueLabel(r.due_date, today)}
                  {r.amount != null ? ` · ${eur(Number(r.amount))}` : ""}
                </div>
              </button>
              <button
                type="button"
                onClick={() => onToggleDone(r)}
                aria-label="Marquer fait"
                className="shrink-0 flex items-center gap-1 text-[12px] font-semibold bg-emerald text-[#FBF3EC] rounded-lg px-3 py-1.5"
              >
                <Check size={14} /> Fait
              </button>
            </div>
          );
        })}

        <button
          type="button"
          onClick={onAdd}
          className="w-full mt-4 border-2 border-dashed border-rule rounded-2xl py-3.5 text-sm font-semibold text-ink-muted flex items-center justify-center gap-1.5"
        >
          <Plus size={16} /> Ajouter un rappel
        </button>
      </div>
    </div>
  );
}
