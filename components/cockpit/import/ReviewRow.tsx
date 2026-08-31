import { eur } from "@/lib/cockpit/format";
import type { Category } from "@/lib/cockpit/types";
import type { ReviewRow as ReviewRowData } from "@/lib/cockpit/bnp-import";
import type { Provenance } from "@/lib/cockpit/classify";

const PROVENANCE_LABEL: Record<Provenance, string> = {
  rule: "règle",
  history: "historique",
  bnp: "BNP",
  transfer: "virement",
  guess: "deviné",
};

export function ReviewRow({
  row,
  categories,
  provenance,
  selected,
  onToggleSelected,
  onOpenPicker,
  onToggleInclude,
  engagementKnown,
  engagement,
  onToggleEngagement,
}: {
  row: ReviewRowData & { include: boolean };
  categories: Category[];
  provenance: Provenance;
  selected: boolean;
  onToggleSelected: (v: boolean) => void;
  onOpenPicker: () => void;
  onCategory?: (name: string) => void;
  onToggleInclude: (v: boolean) => void;
  engagementKnown: boolean;
  engagement: boolean;
  onToggleEngagement: (v: boolean) => void;
}) {
  const neg = row.amount < 0;
  const resolved = categories.some((c) => c.name === row.categoryName);
  return (
    <div
      className={`py-2 border-b border-rule ${
        row.duplicate && !row.include ? "opacity-50" : ""
      }`}
    >
      <div className="flex justify-between items-center gap-2">
        <label className="flex items-center gap-1 text-[11px] text-ink-muted shrink-0">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onToggleSelected(e.target.checked)}
          />
          sél.
        </label>
        <div className="min-w-0 flex-1">
          <div className="text-sm truncate">{row.label}</div>
          <div className="text-[11px] text-ink-muted">
            {row.date}
            {row.duplicate ? " · doublon" : ""}
            <span className="ml-1 text-[10px] uppercase tracking-wide text-ink-muted border border-rule rounded px-1 py-0.5">
              {PROVENANCE_LABEL[provenance]}
            </span>
          </div>
        </div>
        <strong
          className={`font-mono-num text-sm shrink-0 ${
            neg ? "text-strat-a" : "text-emerald"
          }`}
        >
          {eur(row.amount)}
        </strong>
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <button
          type="button"
          onClick={onOpenPicker}
          className={`text-left text-[13px] px-2 py-1.5 rounded-lg border border-rule bg-card ${
            resolved ? "text-ink" : "text-accent"
          }`}
        >
          {row.categoryName || "Choisir…"}
        </button>
        {neg &&
          (engagementKnown ? (
            <span className="text-[11px] text-emerald shrink-0">engagement</span>
          ) : (
            <label className="text-[11px] text-ink-muted flex items-center gap-1 shrink-0">
              <input
                type="checkbox"
                className="accent-emerald"
                checked={engagement}
                onChange={(e) => onToggleEngagement(e.target.checked)}
              />
              engagement
            </label>
          ))}
        {row.duplicate && (
          <label className="text-[11px] text-ink-muted flex items-center gap-1 shrink-0">
            <input
              type="checkbox"
              checked={row.include}
              onChange={(e) => onToggleInclude(e.target.checked)}
            />
            inclure
          </label>
        )}
      </div>
    </div>
  );
}
