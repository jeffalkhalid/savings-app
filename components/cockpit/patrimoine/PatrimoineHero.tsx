import { eur } from "@/lib/cockpit/format";

export function PatrimoineHero({
  total,
  delta,
  count,
}: {
  total: number;
  delta: number | null;
  count: number;
}) {
  return (
    <div
      className="rounded-[26px] p-6 text-[#FBF3EC] relative overflow-hidden mb-4"
      style={{ background: "linear-gradient(135deg,#3E7D5A,#2D5F44)" }}
    >
      <div className="text-[11px] uppercase tracking-[0.12em] opacity-80 mb-2">
        Patrimoine total
      </div>
      <div className="font-display text-4xl leading-none">{eur(total)}</div>
      <div className="flex flex-wrap gap-2 mt-4">
        {delta !== null && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.16] px-3 py-1.5 text-[12px] font-semibold">
            {delta >= 0 ? "▲" : "▼"} {eur(Math.abs(delta))} ce mois
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.16] px-3 py-1.5 text-[12px] font-semibold">
          {count} actif{count > 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
