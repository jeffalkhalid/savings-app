import { eur } from "@/lib/cockpit/format";
import type { CategoryInsight } from "@/lib/cockpit/categories-analysis";
import { budgetStatus, type BudgetState } from "@/lib/cockpit/budget";
import type { LucideIcon } from "lucide-react";

const FILL: Record<Exclude<BudgetState, "none">, string> = {
  ok: "bg-emerald",
  warn: "bg-gold",
  over: "bg-accent",
};

export function CategoryRow({
  insight,
  Icon,
  budget,
  onClick,
}: {
  insight: CategoryInsight;
  Icon: LucideIcon;
  budget: number | null;
  onClick: () => void;
}) {
  const sharePct = Math.round(insight.share * 100);
  const trend =
    insight.deltaPct === null
      ? { text: "nouveau", cls: "text-ink-muted" }
      : insight.deltaPct > 0.05
        ? { text: `+${Math.round(insight.deltaPct * 100)}%`, cls: "text-accent" }
        : insight.deltaPct < -0.05
          ? { text: `${Math.round(insight.deltaPct * 100)}%`, cls: "text-emerald" }
          : { text: "stable", cls: "text-ink-muted" };
  const b = budgetStatus(insight.total, budget);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 py-2.5"
    >
      <div className="w-9 h-9 rounded-xl bg-tile flex items-center justify-center shrink-0">
        <Icon size={17} className="text-ink2" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline gap-2">
          <span className="text-sm truncate">{insight.name}</span>
          <span className="flex items-baseline gap-2 shrink-0">
            <span className="font-mono-num text-sm">−{eur(insight.total)}</span>
            <span className={`font-mono-num text-[11px] ${trend.cls}`}>
              {trend.text}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          {b.state === "none" ? (
            <>
              <div className="h-1.5 flex-1 rounded-full bg-rule overflow-hidden">
                <div className="h-full bg-accent/70" style={{ width: `${sharePct}%` }} />
              </div>
              <span className="font-mono-num text-[11px] text-ink-muted w-9 text-right">
                {sharePct}%
              </span>
            </>
          ) : (
            <>
              <div className="h-1.5 flex-1 rounded-full bg-rule overflow-hidden">
                <div className={`h-full ${FILL[b.state]}`} style={{ width: `${b.pct}%` }} />
              </div>
              <span
                className={`font-mono-num text-[11px] shrink-0 ${
                  b.state === "over" ? "text-accent" : "text-ink-muted"
                }`}
              >
                {eur(insight.total)} / {eur(budget as number)}
              </span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}
