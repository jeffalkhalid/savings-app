"use client";

export function ProjectionTabs({
  active,
  onSelect,
}: {
  active: "projection" | "simulateur";
  onSelect: (t: "projection" | "simulateur") => void;
}) {
  const base = "flex-1 text-center text-[13px] py-2 rounded-lg";
  return (
    <div className="flex gap-2 mb-6">
      <button
        type="button"
        onClick={() => onSelect("projection")}
        className={`${base} ${
          active === "projection"
            ? "bg-ink text-paper"
            : "text-ink-muted border border-rule"
        }`}
      >
        Projection
      </button>
      <button
        type="button"
        onClick={() => onSelect("simulateur")}
        className={`${base} ${
          active === "simulateur"
            ? "bg-ink text-paper"
            : "text-ink-muted border border-rule"
        }`}
      >
        Simulateur PEG/PER
      </button>
    </div>
  );
}
