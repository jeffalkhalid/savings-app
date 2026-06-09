"use client";

import type { SimulationResult, StrategyKey } from "@/lib/types";
import { STRATEGIES } from "@/lib/strategies";
import { formatEuro, formatMultiplier } from "@/lib/format";

interface Props {
  results: SimulationResult[];
  selected: StrategyKey;
}

interface BreakdownRow {
  label: string;
  value: number;
  isHeader?: boolean;
  isTotal?: boolean;
  isNeg?: boolean;
  isPositive?: boolean;
  hint?: string;
}

export function StrategyDetail({ results, selected }: Props) {
  const result = results.find((r) => r.strategy === selected);
  if (!result) return null;
  const meta = STRATEGIES[selected];
  const s = result.summary;

  const rows: BreakdownRow[] = [
    { label: "Capital brut", value: 0, isHeader: true },
    { label: "Valeur PEG", value: s.V_PEG_final },
    { label: "Valeur PER", value: s.V_PER_final },
    { label: "PEA bonus (épargne IR cumulée)", value: s.PEA_final },
    {
      label: "Total brut",
      value: s.gross_total,
      isTotal: true,
      isPositive: true,
    },

    { label: "Base fiscale", value: 0, isHeader: true },
    { label: "Basis PEG cumulé", value: s.basis_PEG },
    { label: "Basis PER cumulé", value: s.basis_PER },
    { label: "Volontaire cumulé PER", value: s.vol_cumul_PER },

    { label: "Plus-values imposables", value: 0, isHeader: true },
    { label: "PV PEG (V − Basis)", value: s.PV_PEG },
    { label: "PV PER (V − Basis)", value: s.PV_PER },
    { label: "PV PEA bonus", value: s.PV_PEA },

    { label: "Impôts à la sortie", value: 0, isHeader: true },
    { label: "CSG PEG (18,6 %)", value: s.tax_PEG_exit, isNeg: true },
    { label: "IR sur volontaire PER (TMI)", value: s.tax_PER_IR, isNeg: true },
    { label: "PFU PV PER (30 %)", value: s.tax_PER_PFU, isNeg: true },
    { label: "CSG PV PEA (17,2 %)", value: s.tax_PEA_exit, isNeg: true },
    {
      label: "Impôts totaux",
      value: s.tax_total,
      isTotal: true,
      isNeg: true,
    },

    { label: "Résultat", value: 0, isHeader: true },
    {
      label: "Capital NET après fiscalité",
      value: s.net_total,
      isTotal: true,
      isPositive: true,
    },
  ];

  return (
    <section className="border border-rule p-6 lg:p-8 bg-paper">
      <div className="flex items-start justify-between gap-6 flex-wrap mb-6">
        <div className="max-w-2xl">
          <div className="flex items-baseline gap-2 mb-1">
            <span
              className="w-3 h-3 inline-block"
              style={{ backgroundColor: meta.color }}
            />
            <span className="text-xs uppercase tracking-wider text-ink-muted">
              Stratégie {selected}
            </span>
          </div>
          <h2 className="font-display text-2xl lg:text-3xl text-ink leading-tight mt-1">
            {meta.label}
          </h2>
          <p className="text-sm text-ink-muted mt-3 leading-relaxed">
            {meta.description}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wider text-ink-muted mb-1">
            Capital NET
          </div>
          <div className="font-mono-num font-display text-3xl lg:text-4xl text-ink">
            {formatEuro(s.net_total)}
          </div>
          <div className="text-xs text-ink-muted mt-1">
            Multiplicateur {formatMultiplier(s.multiplier)} sur versements
            personnels
          </div>
        </div>
      </div>

      <div className="border-t border-rule pt-6">
        <table className="w-full">
          <tbody>
            {rows.map((row, idx) => {
              if (row.isHeader) {
                return (
                  <tr key={idx}>
                    <td
                      colSpan={2}
                      className="pt-5 pb-2 font-display text-xs uppercase tracking-wider text-ink-muted border-b border-rule"
                    >
                      {row.label}
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={idx} className="border-b border-rule/50">
                  <td
                    className={`py-2 text-sm ${
                      row.isTotal ? "font-medium text-ink" : "text-ink-muted"
                    }`}
                  >
                    {row.label}
                  </td>
                  <td
                    className={`py-2 text-right font-mono-num ${
                      row.isTotal ? "text-base font-medium" : "text-sm"
                    } ${
                      row.isPositive
                        ? "text-emerald"
                        : row.isNeg
                          ? "text-strat-a"
                          : "text-ink"
                    }`}
                  >
                    {row.isNeg ? "−" : ""}
                    {formatEuro(row.value)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
