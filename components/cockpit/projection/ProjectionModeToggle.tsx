"use client";

export function ProjectionModeToggle({
  mode,
  onMode,
}: {
  mode: "deterministe" | "montecarlo";
  onMode: (m: "deterministe" | "montecarlo") => void;
}) {
  const base = "flex-1 text-center text-[12px] py-1.5 rounded-lg";
  return (
    <div className="flex gap-2 mb-5">
      <button
        type="button"
        onClick={() => onMode("deterministe")}
        className={`${base} ${
          mode === "deterministe"
            ? "bg-ink text-paper"
            : "text-ink-muted border border-rule"
        }`}
      >
        Déterministe
      </button>
      <button
        type="button"
        onClick={() => onMode("montecarlo")}
        className={`${base} ${
          mode === "montecarlo"
            ? "bg-ink text-paper"
            : "text-ink-muted border border-rule"
        }`}
      >
        Monte Carlo
      </button>
    </div>
  );
}
