"use client";

export function ProjectionModeToggle({
  mode,
  onMode,
}: {
  mode: "deterministe" | "montecarlo";
  onMode: (m: "deterministe" | "montecarlo") => void;
}) {
  const opt = (active: boolean) =>
    `flex-1 rounded-lg py-2 text-[13px] font-medium ${
      active ? "bg-card text-ink" : "text-ink-muted"
    }`;
  return (
    <div className="flex gap-1 bg-seg rounded-xl p-1 mb-5">
      <button type="button" onClick={() => onMode("deterministe")} className={opt(mode === "deterministe")}>
        Déterministe
      </button>
      <button type="button" onClick={() => onMode("montecarlo")} className={opt(mode === "montecarlo")}>
        Monte-Carlo
      </button>
    </div>
  );
}
