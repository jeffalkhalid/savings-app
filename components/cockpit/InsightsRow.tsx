import type { Note } from "@/lib/cockpit/cockpit-notes";
import {
  Sprout,
  ThumbsUp,
  TriangleAlert,
  TrendingUp,
  PieChart,
  type LucideIcon,
} from "lucide-react";

const TONE: Record<Note["tone"], string> = {
  good: "text-emerald",
  ok: "text-gold",
  watch: "text-accent",
};

const STATUS_ICON: Record<Note["tone"], LucideIcon> = {
  good: Sprout,
  ok: ThumbsUp,
  watch: TriangleAlert,
};

function noteIcon(n: Note): LucideIcon {
  if (n.kind === "rise") return TrendingUp;
  if (n.kind === "dominant") return PieChart;
  return STATUS_ICON[n.tone];
}

export function InsightsRow({ notes }: { notes: Note[] }) {
  if (!notes.length) return null;
  return (
    <section className="mb-4">
      <div className="font-display text-[15px] mb-2">À noter</div>
      <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-5 px-5">
        {notes.map((n, i) => {
          const Icon = noteIcon(n);
          return (
            <div key={i} className="shrink-0 w-44 bg-card rounded-2xl p-3.5">
              <Icon size={20} className={TONE[n.tone]} />
              <div className="text-[13px] font-bold mt-2">{n.title}</div>
              <div className="text-[12px] text-ink2 mt-0.5 leading-snug">
                {n.body}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
