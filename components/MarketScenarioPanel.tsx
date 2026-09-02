"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { MarketShock } from "@/lib/market-shock";

function describe(s: MarketShock): string {
  if (s.kind === "krach")
    return `Krach de ${Math.round(s.dropPct * 100)} % en année ${s.atYear}`;
  return `Rendement de ${Math.round(s.rate * 1000) / 10} % pendant ${
    s.years
  } an${s.years > 1 ? "s" : ""} dès l'année ${s.startYear}`;
}

/** Un choc daté au-delà de l'horizon n'est plus simulé — il ne doit pas se lire comme actif. */
function outOfHorizon(s: MarketShock, years: number): boolean {
  const start = s.kind === "krach" ? s.atYear : s.startYear;
  return start < 0 || start >= years;
}

export function MarketScenarioPanel({
  shocks,
  years,
  onChange,
}: {
  shocks: MarketShock[];
  years: number;
  onChange: (next: MarketShock[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<MarketShock["kind"]>("krach");
  const [at, setAt] = useState(3);
  const [drop, setDrop] = useState(30);
  const [span, setSpan] = useState(3);
  const [degraded, setDegraded] = useState(0);

  const maxYear = Math.max(0, years - 1);
  const add = () => {
    // Volontairement NON borné à l'horizon : un choc daté au-delà est conservé
    // tel que saisi et signalé « hors horizon » dans la liste. Le borner
    // silencieusement changerait le scénario demandé.
    const year = Math.max(0, at);
    const s: MarketShock =
      kind === "krach"
        ? { kind, atYear: year, dropPct: Math.min(90, Math.max(1, drop)) / 100 }
        : {
            kind: "rendement",
            startYear: year,
            years: Math.max(1, span),
            rate: degraded / 100,
          };
    onChange([...shocks, s]);
    setOpen(false);
  };

  const label = "block text-xs text-ink-muted mb-1";
  const input =
    "w-full bg-paper border border-rule px-2 py-1.5 text-sm text-ink font-mono-num outline-none";

  return (
    <section className="px-6 lg:px-8 py-6 border-t border-rule">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-[10px] uppercase tracking-[0.16em] text-ink-muted">
          Scénario
        </h3>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-xs text-ink-muted"
        >
          <Plus size={13} />
          Ajouter un choc
        </button>
      </div>

      {!shocks.length && !open && (
        <p className="text-xs text-ink-muted">
          Aucun choc : le classement est celui du scénario central.
        </p>
      )}

      {shocks.map((s, i) => {
        const orphan = outOfHorizon(s, years);
        return (
          <div
            key={i}
            className="flex items-center gap-2 py-2 border-b border-rule"
          >
            <span
              className={`text-xs flex-1 ${
                orphan ? "text-ink-muted line-through" : "text-ink"
              }`}
            >
              {describe(s)}
            </span>
            {orphan && (
              <span className="text-[11px] text-accent whitespace-nowrap">
                hors horizon
              </span>
            )}
            <button
              type="button"
              aria-label="Retirer ce choc"
              onClick={() => onChange(shocks.filter((_, j) => j !== i))}
              className="text-ink-muted p-1"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}

      {open && (
        <div className="mt-3 grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setKind("krach")}
              className={`py-2 text-xs border ${
                kind === "krach"
                  ? "border-ink bg-ink/[0.03] text-ink"
                  : "border-rule text-ink-muted"
              }`}
            >
              Krach
            </button>
            <button
              type="button"
              onClick={() => setKind("rendement")}
              className={`py-2 text-xs border ${
                kind === "rendement"
                  ? "border-ink bg-ink/[0.03] text-ink"
                  : "border-rule text-ink-muted"
              }`}
            >
              Rendement dégradé
            </button>
          </div>

          <div>
            <span className={label}>
              {kind === "krach" ? "Année du krach" : "Première année"}
            </span>
            <input
              type="number"
              min={0}
              max={maxYear}
              value={at}
              onChange={(e) => setAt(Number(e.target.value))}
              className={input}
            />
          </div>

          {kind === "krach" ? (
            <div>
              <span className={label}>Baisse des encours (%)</span>
              <input
                type="number"
                min={1}
                max={90}
                value={drop}
                onChange={(e) => setDrop(Number(e.target.value))}
                className={input}
              />
            </div>
          ) : (
            <>
              <div>
                <span className={label}>Durée (années)</span>
                <input
                  type="number"
                  min={1}
                  max={years}
                  value={span}
                  onChange={(e) => setSpan(Number(e.target.value))}
                  className={input}
                />
              </div>
              <div>
                <span className={label}>
                  Rendement sur la période (%) — 0 ou négatif
                </span>
                <input
                  type="number"
                  min={-20}
                  max={0}
                  step={0.5}
                  value={degraded}
                  onChange={(e) => setDegraded(Number(e.target.value))}
                  className={input}
                />
              </div>
            </>
          )}

          <button
            type="button"
            onClick={add}
            className="bg-emerald text-paper py-2 text-xs font-medium"
          >
            Ajouter
          </button>
        </div>
      )}

      {shocks.length > 0 && (
        <p className="text-[11px] text-ink-muted mt-3">
          Scénario non enregistré : il disparaît en rechargeant la page.
        </p>
      )}
    </section>
  );
}
