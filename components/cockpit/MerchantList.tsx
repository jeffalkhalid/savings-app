"use client";

import { eur } from "@/lib/cockpit/format";
import type { MerchantStat } from "@/lib/cockpit/merchants";
import { SearchX } from "lucide-react";

export function MerchantList({
  merchants,
  onSelect,
}: {
  merchants: MerchantStat[];
  onSelect: (key: string) => void;
}) {
  if (!merchants.length) {
    return (
      <div className="text-center py-8 text-ink-muted">
        <SearchX size={28} className="mx-auto mb-1.5" />
        <div className="text-sm font-semibold text-ink">Aucun commerçant</div>
        <div className="text-xs mt-0.5">Essaie un autre mot ou un autre type.</div>
      </div>
    );
  }

  return (
    <div>
      {merchants.map((m) => (
        <button
          key={m.key}
          type="button"
          onClick={() => onSelect(m.key)}
          className="w-full text-left flex justify-between items-center gap-2.5 py-2.5 border-b border-rule"
        >
          <div className="min-w-0">
            <div className="text-sm truncate">{m.label}</div>
            <div className="text-[11.5px] text-ink-muted mt-0.5">
              {m.count} opération{m.count > 1 ? "s" : ""}
            </div>
          </div>
          <span className="font-mono-num text-sm shrink-0 text-ink">
            {eur(m.total)}
          </span>
        </button>
      ))}
    </div>
  );
}
