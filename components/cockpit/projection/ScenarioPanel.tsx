"use client";

import { Plus, X } from "lucide-react";
import { eur } from "@/lib/cockpit/format";
import type { Shock, ShockSummary } from "@/lib/cockpit/shock";

/** « dans 14 mois » → « nov. 2027 », à partir d'aujourd'hui. */
function monthLabel(offset: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return d.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
}

function describe(s: Shock): string {
  if (s.kind === "revenu")
    return `Perte de revenu · ${s.months} mois dès ${monthLabel(s.startMonth)}${
      s.keepPct > 0 ? ` · ${Math.round(s.keepPct * 100)} % maintenus` : ""
    }`;
  if (s.kind === "depense")
    return `Dépense de ${eur(s.amount)} · ${monthLabel(s.atMonth)}`;
  if (s.kind === "charges")
    return `Charges +${eur(s.monthly)}/mois dès ${monthLabel(s.startMonth)}`;
  return `Krach de ${Math.round(s.dropPct * 100)} % · ${monthLabel(s.atMonth)}`;
}

export function ScenarioPanel({
  shocks,
  summary,
  onAdd,
  onRemove,
}: {
  shocks: Shock[];
  summary: ShockSummary | null;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <section className="mt-5">
      <div className="flex justify-between items-baseline mb-2">
        <div className="font-display text-[15px]">Scénario</div>
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 text-[12px] text-ink-muted"
        >
          <Plus size={14} />
          Ajouter un choc
        </button>
      </div>

      {!shocks.length ? (
        <p className="text-ink-muted text-[13px]">
          Aucun choc. Ajoutes-en un pour voir ce qu&apos;il coûterait — le
          scénario n&apos;est pas enregistré, il disparaît en quittant
          l&apos;écran.
        </p>
      ) : (
        <>
          {shocks.map((s, i) => (
            <div
              key={i}
              className="flex items-center gap-2 py-2.5 border-b border-rule"
            >
              <span className="text-[13px] flex-1">{describe(s)}</span>
              <button
                type="button"
                aria-label="Retirer ce choc"
                onClick={() => onRemove(i)}
                className="text-ink-muted p-1"
              >
                <X size={15} />
              </button>
            </div>
          ))}

          {summary && (
            <div className="bg-card rounded-2xl p-4 mt-3 grid gap-1.5">
              <div className="flex justify-between text-[13px]">
                <span className="text-ink-muted">Creux</span>
                <span className="font-mono-num">
                  {eur(summary.trough.value)} · {monthLabel(summary.trough.month)}
                </span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span className="text-ink-muted">Retour au niveau d&apos;avant</span>
                <span className="font-mono-num">
                  {summary.recoveryMonths === null
                    ? "jamais sur l'horizon"
                    : summary.recoveryMonths === 0
                      ? "jamais descendu"
                      : `${summary.recoveryMonths} mois`}
                </span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span className="text-ink-muted">Écart à l&apos;horizon</span>
                <span className="font-mono-num text-accent">
                  {eur(summary.deltaAtHorizon)}
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
