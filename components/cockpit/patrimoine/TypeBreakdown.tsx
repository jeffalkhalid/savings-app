import { eur } from "@/lib/cockpit/format";
import { withShares, typeLabel } from "@/lib/cockpit/patrimoine";
import type { PatrimoineLine } from "@/lib/cockpit/patrimoine";

export function TypeBreakdown({ lines }: { lines: PatrimoineLine[] }) {
  const rows = withShares(lines);
  if (!rows.length) return null;
  return (
    <section className="mb-6">
      <div className="text-xs uppercase tracking-[0.1em] text-ink-muted mb-2">
        Répartition
      </div>
      {rows.map((r) => (
        <div
          key={r.type}
          className="flex justify-between items-center py-2 border-b border-rule"
        >
          <div>
            <div className="text-sm">{typeLabel(r.type)}</div>
            <div className="text-[11px] text-ink-muted mt-0.5">
              {r.n_assets} ligne{r.n_assets > 1 ? "s" : ""} ·{" "}
              {Math.round(r.share * 100)}%
            </div>
          </div>
          <strong className="font-mono-num text-sm">{eur(r.total_value)}</strong>
        </div>
      ))}
    </section>
  );
}
