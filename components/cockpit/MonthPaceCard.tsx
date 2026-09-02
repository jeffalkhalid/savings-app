"use client";

import { CalendarClock } from "lucide-react";
import { eur } from "@/lib/cockpit/format";
import { PROJECTION_FROM_DAY, type MonthPace } from "@/lib/cockpit/pace";

export function MonthPaceCard({ pace }: { pace: MonthPace }) {
  const depasse = pace.disponible < 0;

  return (
    <div className="bg-card rounded-2xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <CalendarClock size={15} className="text-ink-muted" />
        <span className="text-[12.5px] font-bold">Tenue du mois</span>
      </div>

      <div
        className={`font-mono-num text-2xl ${
          depasse ? "text-accent" : "text-ink"
        }`}
      >
        {eur(pace.disponible)}
      </div>

      <div className="text-[12.5px] text-ink-muted mt-0.5">
        {depasse ? (
          <>
            Mois dépassé, engagements à venir déduits — il reste{" "}
            {pace.joursRestants} jour{pace.joursRestants > 1 ? "s" : ""}.
          </>
        ) : (
          <>
            disponible, soit{" "}
            <span className="font-mono-num text-ink">{eur(pace.parJour)}</span>{" "}
            par jour sur {pace.joursRestants} jour
            {pace.joursRestants > 1 ? "s" : ""}
          </>
        )}
      </div>

      <div className="text-[11.5px] text-ink-muted mt-2 pt-2 border-t border-rule">
        {pace.finDeMois === null ? (
          <>Estimation de fin de mois à partir du {PROJECTION_FROM_DAY}.</>
        ) : (
          <>
            Fin de mois estimée :{" "}
            <span className="font-mono-num">{eur(pace.finDeMois)}</span>
          </>
        )}
      </div>
    </div>
  );
}
