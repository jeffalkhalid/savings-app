import { eur } from "@/lib/cockpit/format";

export function GoalRing({
  pct,
  totalCurrent,
  totalTarget,
}: {
  pct: number;
  totalCurrent: number;
  totalTarget: number;
}) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct);
  return (
    <div className="flex flex-col items-center my-2 mb-5">
      <div className="relative w-[140px] h-[140px]">
        <svg width="140" height="140" className="-rotate-90">
          <circle
            cx="70"
            cy="70"
            r={r}
            fill="none"
            className="stroke-rule"
            strokeWidth="10"
          />
          <circle
            cx="70"
            cy="70"
            r={r}
            fill="none"
            className="stroke-emerald"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={off}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-display text-2xl">{Math.round(pct * 100)}%</span>
        </div>
      </div>
      <div className="font-mono-num text-sm text-ink-muted mt-1">
        {eur(totalCurrent)} / {eur(totalTarget)}
      </div>
    </div>
  );
}
