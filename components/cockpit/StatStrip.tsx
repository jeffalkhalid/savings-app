import type { Metrics } from "@/lib/cockpit/metrics";
import type { TxnType } from "@/lib/cockpit/types";
import { eur } from "@/lib/cockpit/format";

export function StatStrip({
  metrics,
  onDrill,
}: {
  metrics: Metrics;
  onDrill: (type: TxnType) => void;
}) {
  const items: { k: string; v: string; c: string; type: TxnType }[] = [
    { k: "Revenus", v: eur(metrics.revenus), c: "text-emerald", type: "income" },
    { k: "Dépenses", v: eur(metrics.depenses), c: "text-accent", type: "expense" },
    { k: "Épargne", v: eur(metrics.epargne), c: "text-ink", type: "savings" },
  ];
  return (
    <div className="flex gap-2.5 mb-4">
      {items.map((it) => (
        <button
          key={it.k}
          type="button"
          onClick={() => onDrill(it.type)}
          className="flex-1 text-left bg-card rounded-2xl p-3.5"
        >
          <div className="text-[10px] uppercase tracking-[0.05em] text-ink-muted font-semibold">
            {it.k}
          </div>
          <div className={`font-mono-num text-sm mt-1 ${it.c}`}>{it.v}</div>
        </button>
      ))}
    </div>
  );
}
