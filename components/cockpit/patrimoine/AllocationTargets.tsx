import { typeLabel } from "@/lib/cockpit/patrimoine";
import { targetsTotal, type AllocationRow } from "@/lib/cockpit/allocation";

export function AllocationTargets({
  rows,
  targets,
  onEdit,
}: {
  rows: AllocationRow[];
  targets: Record<string, number>;
  onEdit: () => void;
}) {
  const hasTargets = targetsTotal(targets) > 0;
  return (
    <section className="mb-4">
      <div className="flex justify-between items-baseline mb-2">
        <div className="font-display text-[15px]">Allocation cible</div>
        <button type="button" onClick={onEdit} className="text-[12px] text-ink-muted">
          Éditer
        </button>
      </div>
      {!hasTargets ? (
        <button
          type="button"
          onClick={onEdit}
          className="w-full border-2 border-dashed border-rule rounded-2xl py-3.5 text-sm font-semibold text-ink-muted"
        >
          Définis ton allocation cible
        </button>
      ) : (
        rows.map((r) => (
          <div key={r.type} className="py-2">
            <div className="flex justify-between items-baseline">
              <span className="text-sm">{typeLabel(r.type)}</span>
              <span className="flex items-baseline gap-2 text-[11px]">
                <span className="font-mono-num text-ink">
                  {Math.round(r.realPct)}%
                </span>
                <span className="text-ink-muted">
                  cible {r.targetPct != null ? `${Math.round(r.targetPct)}%` : "—"}
                </span>
                {r.delta != null && (
                  <span className="font-mono-num text-ink-muted">
                    {r.delta >= 0 ? "+" : "−"}
                    {Math.abs(Math.round(r.delta))} pts
                  </span>
                )}
              </span>
            </div>
            <div className="relative h-2 mt-1.5">
              <div className="absolute inset-0 rounded-full bg-rule overflow-hidden">
                <div
                  className="h-full bg-emerald"
                  style={{ width: `${Math.min(r.realPct, 100)}%` }}
                />
              </div>
              {r.targetPct != null && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-ink"
                  style={{ left: `${Math.min(r.targetPct, 100)}%` }}
                />
              )}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
