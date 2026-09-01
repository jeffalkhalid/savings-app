"use client";

import { X } from "lucide-react";

export function BulkBar({
  count,
  onPick,
  onClear,
}: {
  count: number;
  onPick: () => void;
  onClear: () => void;
}) {
  if (!count) return null;
  return (
    <div className="sticky bottom-0 z-20 -mx-5 px-5 py-3 bg-card border-t border-rule flex items-center gap-3">
      <span className="text-[13px] text-ink font-medium">
        {count} sélectionnée{count > 1 ? "s" : ""}
      </span>
      <button
        type="button"
        onClick={onPick}
        className="ml-auto bg-emerald text-paper rounded-lg px-4 py-2.5 text-[13px] font-semibold"
      >
        Catégoriser
      </button>
      <button
        type="button"
        aria-label="Tout désélectionner"
        onClick={onClear}
        className="text-ink-muted p-2"
      >
        <X size={16} />
      </button>
    </div>
  );
}
