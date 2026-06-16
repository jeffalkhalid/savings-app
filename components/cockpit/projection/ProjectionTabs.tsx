"use client";

export function ProjectionTabs() {
  return (
    <div className="flex gap-2 mb-6">
      <button
        type="button"
        className="flex-1 text-center text-[13px] py-2 rounded-lg bg-ink text-paper"
      >
        Projection
      </button>
      <button
        type="button"
        disabled
        className="flex-1 text-center text-[13px] py-2 rounded-lg text-ink-muted border border-rule opacity-50"
      >
        Simulateur · bientôt
      </button>
    </div>
  );
}
