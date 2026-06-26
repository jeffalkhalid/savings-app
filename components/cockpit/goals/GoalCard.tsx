import { eur } from "@/lib/cockpit/format";
import { goalIcon } from "@/lib/cockpit/goal-icon";
import {
  goalProgress,
  monthsLeft,
  suggestedMonthly,
  type Goal,
} from "@/lib/cockpit/goals";

export function GoalCard({
  goal,
  today,
  onContribute,
  onEdit,
}: {
  goal: Goal;
  today: string;
  onContribute: () => void;
  onEdit: () => void;
}) {
  const Icon = goalIcon(goal.icon);
  const { pct, remaining, done } = goalProgress(goal);
  const m = monthsLeft(goal.deadline, today);
  const rate = suggestedMonthly(goal, today);
  const sub = done
    ? "Atteint ✓"
    : m !== null
      ? `reste ${m} mois${rate ? ` · ${eur(rate)}/mois` : ""}`
      : `reste ${eur(remaining)}`;

  return (
    <div className="bg-card rounded-2xl p-4 mb-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onEdit}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-tile flex items-center justify-center shrink-0">
            <Icon size={20} className="text-ink2" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{goal.name}</div>
            <div className="text-[11.5px] text-ink-muted mt-0.5">{sub}</div>
          </div>
        </button>
        <button
          type="button"
          onClick={onContribute}
          className="shrink-0 text-[12px] font-semibold bg-emerald text-[#FBF3EC] rounded-lg px-3 py-1.5"
        >
          Contribuer
        </button>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <div className="h-1.5 flex-1 rounded-full bg-rule overflow-hidden">
          <div
            className="h-full bg-emerald"
            style={{ width: `${Math.round(pct * 100)}%` }}
          />
        </div>
        <span className="font-mono-num text-[11px] text-ink-muted shrink-0">
          {eur(goal.current_amount)} / {eur(goal.target_amount)}
        </span>
      </div>
    </div>
  );
}
