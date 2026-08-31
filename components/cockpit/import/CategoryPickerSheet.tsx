"use client";

import type { Category } from "@/lib/cockpit/types";

export function CategoryPickerSheet({
  categories,
  title,
  onPick,
  onClose,
}: {
  categories: Category[];
  title: string;
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/50 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="bg-paper w-full max-w-[600px] max-h-[80vh] overflow-auto px-6 pt-6 pb-10 rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-center mb-4">
          <h2 className="font-display text-xl">{title}</h2>
          <button className="text-ink-muted text-sm" onClick={onClose} type="button">
            Fermer
          </button>
        </header>
        <div className="grid gap-1">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick(c.name)}
              className="flex items-center gap-2 text-left py-3 px-2 rounded-lg text-ink text-[15px] border-b border-rule"
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: c.color }}
              />
              {c.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
