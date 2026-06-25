import type { Metrics } from "@/lib/cockpit/metrics";
import { eur } from "@/lib/cockpit/format";

export function StatStrip({
  metrics,
  onAllOps,
}: {
  metrics: Metrics;
  onAllOps: () => void;
}) {
  return (
    <div className="flex gap-2.5 mb-4">
      <div className="flex-1 bg-card rounded-2xl p-3.5">
        <div className="text-[10px] uppercase tracking-[0.05em] text-ink-muted font-semibold">
          Revenus
        </div>
        <div className="font-mono-num text-sm mt-1 text-emerald">
          {eur(metrics.revenus)}
        </div>
      </div>
      <button
        type="button"
        onClick={onAllOps}
        className="flex-1 text-left bg-card rounded-2xl p-3.5"
      >
        <div className="text-[10px] uppercase tracking-[0.05em] text-ink-muted font-semibold">
          Dépenses
        </div>
        <div className="font-mono-num text-sm mt-1 text-accent">
          {eur(metrics.depenses)}
        </div>
      </button>
      <div className="flex-1 bg-card rounded-2xl p-3.5">
        <div className="text-[10px] uppercase tracking-[0.05em] text-ink-muted font-semibold">
          Épargne
        </div>
        <div className="font-mono-num text-sm mt-1 text-ink">
          {eur(metrics.epargne)}
        </div>
      </div>
    </div>
  );
}
