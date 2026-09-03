"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { MarketShock } from "@/lib/market-shock";
import type { FiscalRates, PolicyShock } from "@/lib/fiscal-shock";

/** Un scénario mêle chocs de marché et chocs de politique dans une seule liste. */
export type ScenarioShock = MarketShock | PolicyShock;

const RATE_LABELS: { key: keyof FiscalRates; label: string }[] = [
  { key: "csgPlusValue", label: "CSG plus-values" },
  { key: "csgAbondement", label: "CSG abondement" },
  { key: "tmi", label: "TMI" },
  { key: "pfuPER", label: "PFU PER" },
  { key: "csgPEA", label: "CSG PEA" },
];

const fr = (n: number) => n.toLocaleString("fr-FR");

function describe(s: ScenarioShock, baseRates: FiscalRates): string {
  if (s.kind === "krach")
    return `Krach de ${Math.round(s.dropPct * 100)} % en année ${s.atYear}`;
  if (s.kind === "rendement")
    return `Rendement de ${fr(Math.round(s.rate * 1000) / 10)} % pendant ${
      s.years
    } an${s.years > 1 ? "s" : ""} dès l'année ${s.startYear}`;
  if (s.kind === "abondement")
    return s.factor === 0
      ? `Abondement supprimé dès l'année ${s.fromYear}`
      : `Abondement × ${fr(s.factor)} dès l'année ${s.fromYear}`;
  // Un choc fiscal ne nomme que les taux qu'il change, ancien taux -> nouveau.
  const changed = RATE_LABELS.filter((r) => s.rates[r.key] !== undefined)
    .map((r) => {
      const from = fr(Math.round(baseRates[r.key] * 1000) / 10);
      const to = fr(Math.round((s.rates[r.key] as number) * 1000) / 10);
      return `${r.label} ${from} → ${to} %`;
    })
    .join(" · ");
  return `Fiscalité dès l'année ${s.fromYear} · ${changed || "aucun taux"}`;
}

/** Un choc daté au-delà de l'horizon n'est plus simulé — il ne doit pas se lire comme actif. */
export function outOfHorizon(s: ScenarioShock, years: number): boolean {
  const start =
    s.kind === "krach"
      ? s.atYear
      : s.kind === "rendement"
        ? s.startYear
        : s.fromYear;
  return start < 0 || start >= years;
}

export function MarketScenarioPanel({
  shocks,
  years,
  baseRates,
  onChange,
}: {
  shocks: ScenarioShock[];
  years: number;
  /** Taux de fiscalité en vigueur avant tout choc, pour afficher « ancien → nouveau ». */
  baseRates: FiscalRates;
  onChange: (next: ScenarioShock[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ScenarioShock["kind"]>("krach");
  const [at, setAt] = useState(3);
  const [drop, setDrop] = useState(30);
  const [span, setSpan] = useState(3);
  const [degraded, setDegraded] = useState(0);
  const [rateKey, setRateKey] = useState<keyof FiscalRates>("pfuPER");
  const [ratePct, setRatePct] = useState(35);
  const [factor, setFactor] = useState(0.5);

  const maxYear = Math.max(0, years - 1);
  const add = () => {
    // Volontairement NON borné à l'horizon : un choc daté au-delà est conservé
    // tel que saisi et signalé « hors horizon » dans la liste. Le borner
    // silencieusement changerait le scénario demandé.
    const year = Math.max(0, at);
    let s: ScenarioShock;
    if (kind === "krach") {
      s = { kind, atYear: year, dropPct: Math.min(90, Math.max(1, drop)) / 100 };
    } else if (kind === "rendement") {
      s = {
        kind,
        startYear: year,
        years: Math.max(1, span),
        rate: degraded / 100,
      };
    } else if (kind === "abondement") {
      s = { kind, fromYear: year, factor: Math.max(0, factor) };
    } else {
      s = {
        kind: "fiscalite",
        fromYear: year,
        rates: { [rateKey]: Math.min(100, Math.max(0, ratePct)) / 100 },
      };
    }
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
              {describe(s, baseRates)}
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
            {(
              [
                ["krach", "Krach"],
                ["rendement", "Rendement dégradé"],
                ["fiscalite", "Fiscalité"],
                ["abondement", "Abondement"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setKind(v)}
                className={`py-2 text-xs border ${
                  kind === v
                    ? "border-ink bg-ink/[0.03] text-ink"
                    : "border-rule text-ink-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div>
            <span className={label}>
              {kind === "krach" ? "Quand" : "À partir de"}
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

          {kind === "krach" && (
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
          )}

          {kind === "rendement" && (
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

          {kind === "fiscalite" && (
            <>
              <div>
                <span className={label}>Taux modifié</span>
                <select
                  value={rateKey}
                  onChange={(e) =>
                    setRateKey(e.target.value as keyof FiscalRates)
                  }
                  className={input}
                >
                  {RATE_LABELS.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className={label}>Nouveau taux (%)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={ratePct}
                  onChange={(e) => setRatePct(Number(e.target.value))}
                  className={input}
                />
              </div>
            </>
          )}

          {kind === "abondement" && (
            <div>
              <span className={label}>
                Facteur — 0 supprime, 0,5 divise par deux
              </span>
              <input
                type="number"
                min={0}
                max={3}
                step={0.1}
                value={factor}
                onChange={(e) => setFactor(Number(e.target.value))}
                className={input}
              />
            </div>
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
