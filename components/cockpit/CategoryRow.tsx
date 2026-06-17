import { eur } from "@/lib/cockpit/format";
import type { CategoryInsight } from "@/lib/cockpit/categories-analysis";

export function CategoryRow({
  insight,
  onClick,
}: {
  insight: CategoryInsight;
  onClick: () => void;
}) {
  const pct = Math.round(insight.share * 100);
  const trend =
    insight.deltaPct === null
      ? { text: "nouveau", cls: "text-ink-muted" }
      : insight.deltaPct > 0.05
        ? { text: `↑ +${Math.round(insight.deltaPct * 100)}%`, cls: "text-strat-a" }
        : insight.deltaPct < -0.05
          ? { text: `↓ ${Math.round(insight.deltaPct * 100)}%`, cls: "text-emerald" }
          : { text: "stable", cls: "text-ink-muted" };

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left py-2.5 border-b border-rule"
    >
      <div className="flex justify-between items-baseline gap-2">
        <div className="text-sm">{insight.name}</div>
        <div className="flex items-baseline gap-2 shrink-0">
          <span className="font-mono-num text-sm text-strat-a">
            −{eur(insight.total)}
          </span>
          <span className={`font-mono-num text-[11px] ${trend.cls}`}>
            {trend.text}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <div className="h-1.5 flex-1 rounded-full bg-rule overflow-hidden">
          <div className="h-full bg-ink" style={{ width: `${pct}%` }} />
        </div>
        <span className="font-mono-num text-[11px] text-ink-muted w-9 text-right">
          {pct}%
        </span>
      </div>
    </button>
  );
}
