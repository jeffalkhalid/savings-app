import type { Note } from "@/lib/cockpit/cockpit-notes";

const TONE: Record<Note["tone"], string> = {
  good: "text-emerald",
  ok: "text-gold",
  watch: "text-accent",
};

export function InsightsRow({ notes }: { notes: Note[] }) {
  if (!notes.length) return null;
  return (
    <section className="mb-4">
      <div className="font-display text-[15px] mb-2">À noter</div>
      <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-5 px-5">
        {notes.map((n, i) => (
          <div key={i} className="shrink-0 w-44 bg-card rounded-2xl p-3.5">
            <div className={`text-xl ${TONE[n.tone]}`}>{n.icon}</div>
            <div className="text-[13px] font-bold mt-2">{n.title}</div>
            <div className="text-[12px] text-ink2 mt-0.5 leading-snug">
              {n.body}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
