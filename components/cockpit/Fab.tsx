"use client";

export function Fab({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Ajouter une transaction"
      className="fixed bottom-20 right-5 z-40 w-14 h-14 rounded-full bg-emerald text-paper text-3xl font-light flex items-center justify-center shadow-lg"
    >
      +
    </button>
  );
}
