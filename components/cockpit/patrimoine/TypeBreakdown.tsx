import { eur } from "@/lib/cockpit/format";
import { withShares, typeLabel } from "@/lib/cockpit/patrimoine";
import type { PatrimoineLine } from "@/lib/cockpit/patrimoine";

export function TypeBreakdown({ lines }: { lines: PatrimoineLine[] }) {
  const rows = withShares(lines);
  if (!rows.length) return null;
  return (
    <section className="mb-4">
      <div className="font-display text-[15px] mb-2">Répartition</div>
      {rows.map((r) => {
        const pct = Math.round(r.share * 100);
        return (
          <div key={r.type} className="py-2">
            <div className="flex justify-between items-baseline">
              <span className="text-sm">{typeLabel(r.type)}</span>
              <span className="flex items-baseline gap-2">
                <span className="font-mono-num text-sm">
                  {eur(r.total_value)}
                </span>
                <span className="text-[11px] text-ink-muted">{pct}%</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-rule overflow-hidden mt-1.5">
              <div className="h-full bg-emerald" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </section>
  );
}
