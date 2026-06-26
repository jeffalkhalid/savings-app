import { eur } from "@/lib/cockpit/format";

export function EngagementsBar({
  paid,
  pending,
  variable,
  onDrill,
}: {
  paid: number;
  pending: number;
  variable: number;
  onDrill: () => void;
}) {
  const total = paid + variable;
  const pct = total > 0 ? Math.round((paid / total) * 100) : 0;
  return (
    <button
      type="button"
      onClick={onDrill}
      className="w-full text-left bg-card rounded-2xl p-4 mb-4"
    >
      <div className="flex justify-between items-baseline mb-2.5">
        <span className="text-[12.5px] font-bold">Engagements &amp; variable</span>
        <span className="font-mono-num text-[11.5px] text-ink-muted">
          {eur(paid)} · {eur(variable)}
        </span>
      </div>
      <div className="flex h-2.5 rounded-md overflow-hidden gap-[3px]">
        <div className="bg-emerald rounded-sm" style={{ width: `${pct}%` }} />
        <div className="bg-gold rounded-sm" style={{ width: `${100 - pct}%` }} />
      </div>
      <div className="flex gap-4 mt-2 text-[11px] text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald inline-block" />
          Engagements {pct}%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-gold inline-block" />
          Variable {100 - pct}%
        </span>
      </div>
      {pending > 0 && (
        <div className="text-[11px] text-accent mt-2">
          Il reste {eur(pending)} d&apos;engagements à payer ce mois.
        </div>
      )}
    </button>
  );
}
