"use client";

export function TransferNudge({
  count,
  onAuto,
  onManual,
  busy,
}: {
  count: number;
  onAuto: () => void;
  onManual: () => void;
  busy: boolean;
}) {
  if (count <= 0) return null;
  return (
    <div className="flex items-center justify-between gap-2 mb-6 border border-rule rounded-lg px-3 py-2.5">
      <span className="text-[13px] text-ink-muted">
        {count} virement{count > 1 ? "s" : ""} à classer
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onAuto}
          disabled={busy}
          className="text-[12px] bg-emerald text-paper rounded-lg px-3 py-1.5 disabled:opacity-60"
        >
          {busy ? "…" : "Classer auto"}
        </button>
        <button
          type="button"
          onClick={onManual}
          className="text-[12px] text-ink-muted border border-rule rounded-lg px-3 py-1.5"
        >
          À la main
        </button>
      </div>
    </div>
  );
}
