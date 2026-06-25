import type { Metrics } from "@/lib/cockpit/metrics";
import { eur } from "@/lib/cockpit/format";

export function StatStrip({ metrics }: { metrics: Metrics }) {
  const items = [
    { k: "Revenus", v: eur(metrics.revenus), c: "text-emerald" },
    { k: "Dépenses", v: eur(metrics.depenses), c: "text-strat-a" },
    { k: "Épargne", v: eur(metrics.epargne), c: "text-ink" },
  ];
  return (
    <div className="flex mb-6">
      {items.map((it, i) => (
        <div
          key={it.k}
          className={`flex-1 ${i > 0 ? "border-l border-rule pl-2.5" : ""}`}
        >
          <div className="text-[9.5px] uppercase tracking-[0.08em] text-ink-muted">
            {it.k}
          </div>
          <div className={`font-mono-num text-sm mt-1 ${it.c}`}>{it.v}</div>
        </div>
      ))}
    </div>
  );
}
