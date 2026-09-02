"use client";

import { eur } from "@/lib/cockpit/format";
import { MerchantSeriesBars } from "@/components/cockpit/MerchantSeriesBars";
import type { Drift } from "@/lib/cockpit/drift";

/**
 * Une dérive et ce qu'on peut en faire.
 *
 * L'impact annuel est mis en avant plutôt que la pente : c'est lui qui décide
 * d'agir ou non. La pente reste affichée parce qu'elle dit à quelle vitesse
 * cela monte — mais c'est une moyenne, pas le montant de la dernière hausse.
 */
export function DriftRow({
  drift,
  actionLabel,
  onAction,
  onOpen,
  busy,
}: {
  drift: Drift;
  actionLabel: string;
  onAction: () => void;
  onOpen: () => void;
  busy: boolean;
}) {
  return (
    <div className="bg-card rounded-2xl p-4 mb-3">
      <div className="flex justify-between items-baseline gap-3 mb-0.5">
        <span className="text-[14px] font-medium truncate">{drift.label}</span>
        <span className="font-mono-num text-[15px] text-accent shrink-0">
          +{eur(drift.annualImpact)} / an
        </span>
      </div>
      <div className="text-[12.5px] text-ink-muted mb-2">
        <span className="font-mono-num">+{eur(drift.slope)}</span> par mois en
        moyenne · dernier montant{" "}
        <span className="font-mono-num">{eur(drift.recent)}</span>
      </div>
      <div
        className="text-[11.5px] text-ink-muted mb-2"
        title="Part de la variation expliquée par la tendance : plus c'est haut, plus la hausse est régulière."
      >
        {drift.monthsSeen} mois observés · régularité{" "}
        {Math.round(drift.r2 * 100)} %
      </div>

      <MerchantSeriesBars series={drift.series} />

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 bg-seg text-ink rounded-lg py-2.5 text-[13px] font-semibold"
        >
          Fiche
        </button>
        <button
          type="button"
          onClick={onAction}
          disabled={busy}
          className="flex-1 bg-emerald text-paper rounded-lg py-2.5 text-[13px] font-semibold disabled:opacity-50"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
