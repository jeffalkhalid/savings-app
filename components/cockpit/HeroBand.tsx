import type { Metrics } from "@/lib/cockpit/metrics";
import { eur } from "@/lib/cockpit/format";

export function HeroBand({
  metrics,
  monthLabel,
}: {
  metrics: Metrics;
  monthLabel: string;
}) {
  const pct = Math.round(metrics.tauxEpargne * 100);
  return (
    <div className="border-b-2 border-ink pb-5 mb-5">
      <div className="flex justify-between items-end gap-3">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-ink-muted mb-1.5">
            Taux d&apos;épargne · {monthLabel}
          </div>
          <div className="font-display text-emerald text-5xl leading-none">
            {pct}&thinsp;%
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-ink-muted mb-1.5">
            Reste à vivre
          </div>
          <div className="font-display text-3xl leading-none">
            {eur(metrics.resteAVivre)}
          </div>
        </div>
      </div>
    </div>
  );
}
