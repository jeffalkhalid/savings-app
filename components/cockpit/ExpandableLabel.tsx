"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * Libellé bancaire dépliable.
 *
 * Les libellés BNP dépassent largement la largeur d'un téléphone et sont
 * coupés avant la partie utile — c'est ce qui rend trois prélèvements du même
 * créancier indiscernables. Un appui déplie le texte entier sur place.
 * Le contrôle n'apparaît que s'il y a réellement quelque chose de masqué.
 */
export function ExpandableLabel({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const isLong = text.length > 38;

  if (!isLong) return <div className="text-sm">{text}</div>;

  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-label={open ? "Réduire le libellé" : "Afficher le libellé complet"}
      className="w-full text-left flex items-start gap-1"
    >
      <span className={`text-sm min-w-0 ${open ? "break-words" : "truncate"}`}>
        {text}
      </span>
      {open ? (
        <ChevronUp size={14} className="text-ink-muted shrink-0 mt-0.5" />
      ) : (
        <ChevronDown size={14} className="text-ink-muted shrink-0 mt-0.5" />
      )}
    </button>
  );
}
