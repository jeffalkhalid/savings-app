"use client";

import { useState } from "react";
import type { SimulationResult, StrategyKey } from "@/lib/types";
import { STRATEGIES, STRATEGY_KEYS } from "@/lib/strategies";
import { formatEuro, formatMultiplier } from "@/lib/format";
import { downloadCSV } from "@/lib/exportCSV";
import { Download } from "lucide-react";

interface Props {
  results: SimulationResult[];
  selected: StrategyKey;
}

export function DataTables({ results, selected }: Props) {
  const [tab, setTab] = useState<"comparative" | "annual">("comparative");

  return (
    <section className="border border-rule bg-paper">
      <div className="border-b border-rule px-6 lg:px-8 py-5 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h2 className="font-display text-2xl text-ink">Tableaux</h2>
          <p className="text-xs text-ink-muted mt-1">
            Toutes les données exportables en CSV (compatible Excel fr-FR).
          </p>
        </div>
        <div className="flex border border-rule">
          <button
            onClick={() => setTab("comparative")}
            className={`px-4 py-2 text-xs uppercase tracking-wider transition-colors ${
              tab === "comparative"
                ? "bg-ink text-paper"
                : "text-ink hover:bg-ink/[0.04]"
            }`}
          >
            Synthèse comparative
          </button>
          <button
            onClick={() => setTab("annual")}
            className={`px-4 py-2 text-xs uppercase tracking-wider transition-colors border-l border-rule ${
              tab === "annual"
                ? "bg-ink text-paper"
                : "text-ink hover:bg-ink/[0.04]"
            }`}
          >
            Détail annuel
          </button>
        </div>
      </div>

      {tab === "comparative" ? (
        <ComparativeTable results={results} />
      ) : (
        <AnnualTable results={results} selected={selected} />
      )}
    </section>
  );
}

function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 px-3 py-1.5 text-xs uppercase tracking-wider text-ink hover:text-emerald border border-rule hover:border-emerald transition-colors"
    >
      <Download size={12} strokeWidth={2} />
      Exporter CSV
    </button>
  );
}

function ComparativeTable({ results }: { results: SimulationResult[] }) {
  type Row = {
    label: string;
    section?: boolean;
    value: (r: SimulationResult) => number;
    format?: (n: number) => string;
    bold?: boolean;
    isNeg?: boolean;
  };

  const rows: Row[] = [
    {
      label: "Capital brut",
      section: true,
      value: () => 0,
    },
    { label: "Valeur PEG", value: (r) => r.summary.V_PEG_final },
    { label: "Valeur PER", value: (r) => r.summary.V_PER_final },
    { label: "PEA bonus", value: (r) => r.summary.PEA_final },
    {
      label: "Total brut",
      value: (r) => r.summary.gross_total,
      bold: true,
    },
    { label: "Base fiscale", section: true, value: () => 0 },
    { label: "Basis PEG", value: (r) => r.summary.basis_PEG },
    { label: "Basis PER", value: (r) => r.summary.basis_PER },
    { label: "Volontaire cumulé PER", value: (r) => r.summary.vol_cumul_PER },
    { label: "Plus-values imposables", section: true, value: () => 0 },
    { label: "PV PEG", value: (r) => r.summary.PV_PEG },
    { label: "PV PER", value: (r) => r.summary.PV_PER },
    { label: "PV PEA", value: (r) => r.summary.PV_PEA },
    { label: "Impôts à la sortie", section: true, value: () => 0 },
    { label: "CSG PEG (18,6%)", value: (r) => r.summary.tax_PEG_exit, isNeg: true },
    { label: "IR sur volontaire PER (TMI)", value: (r) => r.summary.tax_PER_IR, isNeg: true },
    { label: "PFU PV PER (30%)", value: (r) => r.summary.tax_PER_PFU, isNeg: true },
    { label: "CSG PV PEA (17,2%)", value: (r) => r.summary.tax_PEA_exit, isNeg: true },
    {
      label: "Impôts totaux",
      value: (r) => r.summary.tax_total,
      bold: true,
      isNeg: true,
    },
    { label: "Résultat", section: true, value: () => 0 },
    {
      label: "Capital NET",
      value: (r) => r.summary.net_total,
      bold: true,
    },
    {
      label: "Multiplicateur",
      value: (r) => r.summary.multiplier,
      format: (n) => formatMultiplier(n),
    },
  ];

  const handleExport = () => {
    const headers = [
      "Métrique",
      ...STRATEGY_KEYS.map((k) => `${k} - ${STRATEGIES[k].short}`),
    ];
    const csvRows = rows
      .filter((r) => !r.section)
      .map((r) => [r.label, ...results.map((res) => r.value(res))]);
    downloadCSV("synthese-comparative.csv", headers, csvRows);
  };

  return (
    <div>
      <div className="px-6 lg:px-8 py-4 flex justify-end border-b border-rule">
        <ExportButton onClick={handleExport} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-rule">
              <th className="text-left px-6 lg:px-8 py-3 font-medium text-xs uppercase tracking-wider text-ink-muted sticky left-0 bg-paper">
                Métrique
              </th>
              {STRATEGY_KEYS.map((k) => (
                <th
                  key={k}
                  className="text-right px-4 py-3 font-medium text-xs uppercase tracking-wider whitespace-nowrap"
                  style={{ color: STRATEGIES[k].color }}
                >
                  {k} — {STRATEGIES[k].short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              if (row.section) {
                return (
                  <tr key={idx}>
                    <td
                      colSpan={results.length + 1}
                      className="pt-5 pb-2 px-6 lg:px-8 font-display text-xs uppercase tracking-wider text-ink-muted border-b border-rule"
                    >
                      {row.label}
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={idx} className="border-b border-rule/40">
                  <td
                    className={`px-6 lg:px-8 py-2 sticky left-0 bg-paper ${
                      row.bold ? "font-medium text-ink" : "text-ink-muted"
                    }`}
                  >
                    {row.label}
                  </td>
                  {results.map((r) => (
                    <td
                      key={r.strategy}
                      className={`px-4 py-2 text-right font-mono-num ${
                        row.bold ? "font-medium text-ink" : "text-ink"
                      } ${row.isNeg ? "text-strat-a" : ""}`}
                    >
                      {row.format
                        ? row.format(row.value(r))
                        : (row.isNeg ? "−" : "") + formatEuro(row.value(r))}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AnnualTable({
  results,
  selected,
}: {
  results: SimulationResult[];
  selected: StrategyKey;
}) {
  const result = results.find((r) => r.strategy === selected);
  if (!result) return null;
  const meta = STRATEGIES[selected];

  const handleExport = () => {
    const headers = [
      "Année",
      "Use PEG",
      "K PEG",
      "K PER",
      "Mature",
      "W (retrait)",
      "CSG N",
      "M brut",
      "M net",
      "D total",
      "P PEG",
      "P PER",
      "Basis PEG",
      "PEA bonus",
      "Total brut",
    ];
    const csvRows = result.annual.map((a) => [
      a.year,
      a.usePEG,
      a.K_PEG,
      a.K_PER,
      a.mature,
      a.W,
      a.N,
      a.M_gross,
      a.M_net,
      a.D_total,
      a.P_PEG,
      a.P_PER,
      a.basis_PEG,
      a.PEA_bonus,
      a.total_gross,
    ]);
    downloadCSV(
      `annuel-${selected}-${meta.short.replace(/\s+/g, "-")}.csv`,
      headers,
      csvRows,
    );
  };

  return (
    <div>
      <div className="px-6 lg:px-8 py-4 flex items-end justify-between flex-wrap gap-3 border-b border-rule">
        <div>
          <div className="flex items-baseline gap-2">
            <span
              className="w-2.5 h-2.5 inline-block"
              style={{ backgroundColor: meta.color }}
            />
            <span className="text-xs uppercase tracking-wider text-ink-muted">
              Stratégie {selected}
            </span>
          </div>
          <div className="font-display text-base text-ink mt-0.5">
            {meta.label}
          </div>
        </div>
        <ExportButton onClick={handleExport} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-rule bg-paper">
              {[
                "An",
                "PEG?",
                "K PEG",
                "K PER",
                "Mature",
                "W",
                "CSG",
                "M brut",
                "M net",
                "D total",
                "P PEG",
                "P PER",
                "Basis PEG",
                "PEA",
                "Total brut",
              ].map((h) => (
                <th
                  key={h}
                  className="text-right px-2 lg:px-3 py-2.5 font-medium text-[10px] uppercase tracking-wider text-ink-muted whitespace-nowrap first:text-left first:px-6 first:lg:px-8"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.annual.map((a) => (
              <tr key={a.year} className="border-b border-rule/30 hover:bg-ink/[0.02]">
                <td className="px-6 lg:px-8 py-1.5 font-mono-num text-ink">
                  {a.year}
                </td>
                <td className="px-2 lg:px-3 py-1.5 text-right font-mono-num text-ink-muted">
                  {a.usePEG}
                </td>
                <td className="px-2 lg:px-3 py-1.5 text-right font-mono-num">
                  {formatEuro(a.K_PEG)}
                </td>
                <td className="px-2 lg:px-3 py-1.5 text-right font-mono-num">
                  {formatEuro(a.K_PER)}
                </td>
                <td className="px-2 lg:px-3 py-1.5 text-right font-mono-num text-ink-muted">
                  {a.mature > 0 ? formatEuro(a.mature) : "—"}
                </td>
                <td className="px-2 lg:px-3 py-1.5 text-right font-mono-num text-ink-muted">
                  {a.W > 0 ? formatEuro(a.W) : "—"}
                </td>
                <td className="px-2 lg:px-3 py-1.5 text-right font-mono-num text-strat-a">
                  {a.N > 0 ? "−" + formatEuro(a.N) : "—"}
                </td>
                <td className="px-2 lg:px-3 py-1.5 text-right font-mono-num text-ink-muted">
                  {a.M_gross > 0 ? formatEuro(a.M_gross) : "—"}
                </td>
                <td className="px-2 lg:px-3 py-1.5 text-right font-mono-num">
                  {a.M_net > 0 ? formatEuro(a.M_net) : "—"}
                </td>
                <td className="px-2 lg:px-3 py-1.5 text-right font-mono-num text-ink-muted">
                  {a.D_total > 0 ? formatEuro(a.D_total) : "—"}
                </td>
                <td className="px-2 lg:px-3 py-1.5 text-right font-mono-num font-medium">
                  {formatEuro(a.P_PEG)}
                </td>
                <td className="px-2 lg:px-3 py-1.5 text-right font-mono-num font-medium">
                  {formatEuro(a.P_PER)}
                </td>
                <td className="px-2 lg:px-3 py-1.5 text-right font-mono-num text-ink-muted">
                  {formatEuro(a.basis_PEG)}
                </td>
                <td className="px-2 lg:px-3 py-1.5 text-right font-mono-num text-ink-muted">
                  {a.PEA_bonus > 0 ? formatEuro(a.PEA_bonus) : "—"}
                </td>
                <td className="px-2 lg:px-3 py-1.5 text-right font-mono-num font-medium text-emerald">
                  {formatEuro(a.total_gross)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
