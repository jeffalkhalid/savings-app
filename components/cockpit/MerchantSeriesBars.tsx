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
      <div className="flex justify-between items-baseline mb-2">
        <span className="text-[11px] uppercase tracking-wide text-ink-muted">
          Par mois
        </span>
        {/* Donne l'échelle : sans elle, seules les hauteurs relatives se lisent,
            et le survol qui révèle les montants n'existe pas au doigt. */}
        <span className="font-mono-num text-[11px] text-ink-muted">
          max {eur(max)}
        </span>
      </div>
      {/* Les barres sont enfants DIRECTS d'une rangée de hauteur définie : un
          pourcentage ne se résout que contre une hauteur explicite. Les
          libellés vivent dans une rangée séparée, sinon ils feraient partie de
          la hauteur contre laquelle le pourcentage se calcule. */}
      <div className="flex items-end gap-1 h-20">
        {series.map((p) => (
          <div
            key={p.month}
            className="flex-1 bg-accent rounded-sm min-h-[2px]"
            style={{ height: `${max > 0 ? (p.total / max) * 100 : 0}%` }}
            title={`${shortMonth(p.month)} · ${eur(p.total)}`}
          />
        ))}
      </div>
      <div className="flex gap-1 mt-1">
        {series.map((p) => (
          <span
            key={p.month}
            className="flex-1 text-[9px] text-ink-muted text-center"
          >
            {shortMonth(p.month)}
          </span>
        ))}
      </div>
    </div>
  );
}
