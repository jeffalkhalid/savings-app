import type { Metrics } from "@/lib/cockpit/metrics";
import { eur } from "@/lib/cockpit/format";

export function StatStrip({
  metrics,
  onTransfers,
}: {
  metrics: Metrics;
  onTransfers?: () => void;
}) {
  const items: { k: string; v: string; c: string; onClick?: () => void }[] = [
    { k: "Revenus", v: eur(metrics.revenus), c: "text-emerald" },
    { k: "Dépenses", v: eur(metrics.depenses), c: "text-strat-a" },
    { k: "Épargne", v: eur(metrics.epargne), c: "text-ink" },
    { k: "Transferts", v: eur(metrics.transferts), c: "text-ink", onClick: onTransfers },
  ];
  return (
    <div className="flex mb-6">
      {items.map((it, i) => {
        const cls = `flex-1 text-left ${i > 0 ? "border-l border-rule pl-2.5" : ""}`;
        const inner = (
          <>
            <div className="text-[9.5px] uppercase tracking-[0.08em] text-ink-muted">
              {it.k}
            </div>
            <div className={`font-mono-num text-sm mt-1 ${it.c}`}>{it.v}</div>
          </>
        );
        return it.onClick ? (
          <button key={it.k} type="button" onClick={it.onClick} className={cls}>
            {inner}
          </button>
        ) : (
          <div key={it.k} className={cls}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
