import { eur } from "@/lib/cockpit/format";
import type { Category } from "@/lib/cockpit/types";
import type { ReviewRow as ReviewRowData } from "@/lib/cockpit/bnp-import";

export function ReviewRow({
  row,
  categories,
  onCategory,
  onToggleInclude,
  engagementKnown,
  engagement,
  onToggleEngagement,
}: {
  row: ReviewRowData & { include: boolean };
  categories: Category[];
  onCategory: (name: string) => void;
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
        <div className="min-w-0">
          <div className="text-sm truncate">{row.label}</div>
          <div className="text-[11px] text-ink-muted">
            {row.date}
            {row.duplicate ? " · doublon" : ""}
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
        <select
          className={`border rounded-lg px-2 py-1.5 text-[13px] bg-card text-ink flex-1 ${
            resolved ? "border-rule" : "border-strat-a"
          }`}
          value={row.categoryName}
          onChange={(e) => onCategory(e.target.value)}
        >
          {!resolved && (
            <option value={row.categoryName}>{row.categoryName} (?)</option>
          )}
          {categories.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
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
