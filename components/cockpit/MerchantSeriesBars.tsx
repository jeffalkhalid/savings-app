"use client";

import { eur } from "@/lib/cockpit/format";

/**
 * Évolution mensuelle en barres CSS. Une quinzaine de points au plus : une
 * bibliothèque de graphiques serait disproportionnée ici.
 */
export function MerchantSeriesBars({
  series,
}: {
  series: { month: string; total: number }[];
}) {
  if (series.length < 2) return null;
  const max = Math.max(...series.map((p) => p.total));
  const shortMonth = (m: string) =>
    new Date(`${m}-01T00:00:00`).toLocaleDateString("fr-FR", { month: "short" });

  return (
    <div className="bg-card rounded-xl p-3 mb-4">
      <div className="text-[11px] uppercase tracking-wide text-ink-muted mb-2">
        Par mois
      </div>
      <div className="flex items-end gap-1 h-20">
        {series.map((p) => (
          <div key={p.month} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full bg-accent rounded-sm"
              style={{ height: `${max > 0 ? (p.total / max) * 100 : 0}%` }}
              title={`${shortMonth(p.month)} · ${eur(p.total)}`}
            />
            <span className="text-[9px] text-ink-muted">{shortMonth(p.month)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
