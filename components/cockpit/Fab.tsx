"use client";

export function Fab({
  onClick,
  label = "Ajouter",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="fixed bottom-20 right-5 z-40 w-14 h-14 rounded-full bg-emerald text-paper text-3xl font-light flex items-center justify-center shadow-lg"
    >
      +
    </button>
  );
}
