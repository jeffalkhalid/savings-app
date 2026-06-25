import type { Mood } from "@/lib/cockpit/mood";
import { eur } from "@/lib/cockpit/format";

const TONE_BG: Record<Mood["tone"], string> = {
  good: "linear-gradient(135deg,#3E7D5A,#2D5F44)",
  ok: "linear-gradient(135deg,#E3B23C,#C98A2E)",
  watch: "linear-gradient(135deg,#C75B39,#A84527)",
};

export function HeroCard({
  taux,
  reste,
  monthLabel,
  mood,
  goal,
}: {
  taux: number;
  reste: number;
  monthLabel: string;
  mood: Mood;
  goal: number;
}) {
  const pct = Math.round(taux * 100);
  const goalPct = Math.round(goal * 100);
  return (
    <div
      className="rounded-[26px] p-6 text-[#FBF3EC] relative overflow-hidden mb-4"
      style={{ background: TONE_BG[mood.tone] }}
    >
      <div className="text-[11px] uppercase tracking-[0.12em] opacity-80 mb-2">
        Taux d&apos;épargne · {monthLabel}
      </div>
      <div className="flex items-baseline gap-3">
        <div className="font-display text-5xl leading-none">{pct}&thinsp;%</div>
        <div className="text-[13px] opacity-90">objectif {goalPct}&thinsp;%</div>
      </div>
      <div className="h-[7px] rounded-full bg-white/25 overflow-hidden my-4">
        <div
          className="h-full bg-white/90 rounded-full"
          style={{ width: `${Math.round(mood.progress * 100)}%` }}
        />
      </div>
      <div className="flex justify-between items-end">
        <div>
          <div className="text-[11px] uppercase tracking-[0.1em] opacity-80">
            Reste à vivre
          </div>
          <div className="font-mono-num text-2xl mt-0.5">{eur(reste)}</div>
        </div>
        <span className="rounded-full bg-white/20 px-3.5 py-1.5 text-[12px] font-semibold">
          {mood.label}
        </span>
      </div>
    </div>
  );
}
