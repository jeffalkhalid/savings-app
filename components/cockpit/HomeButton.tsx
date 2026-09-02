"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid } from "lucide-react";

/**
 * Retour au Cockpit, visible en permanence.
 *
 * Rendu par le layout et non par les pages : les sous-pages remplacent leur
 * en-tête — donc leur lien « ‹ Cockpit » — dès qu'on ouvre le drill d'une
 * catégorie ou la fiche d'un commerçant. Depuis le layout, il survit à tous
 * ces états.
 *
 * Volontairement en `z-40`, sous les modales et les feuilles (`z-[1000]`) :
 * un bouton qui flotterait par-dessus une confirmation de suppression serait
 * un piège.
 *
 * L'icône est celle que la barre d'onglets utilise déjà pour « Cockpit » —
 * le même symbole doit vouloir dire la même chose partout.
 */
const HIDDEN_ON = new Set([
  // On y est déjà.
  "/cockpit",
  // Son propre bouton « Retour » occupe exactement ce coin.
  "/cockpit/import",
]);

export function HomeButton() {
  const pathname = usePathname();
  if (HIDDEN_ON.has(pathname)) return null;

  return (
    // Le conteneur suit la colonne du contenu pour que le bouton s'aligne sur
    // elle, et ne capte aucun clic en dehors du bouton lui-même.
    <div className="fixed top-0 inset-x-0 z-40 pointer-events-none">
      <div className="max-w-[600px] mx-auto px-5 pt-3 flex justify-end">
        <Link
          href="/cockpit"
          aria-label="Retour au Cockpit"
          className="pointer-events-auto w-10 h-10 rounded-full bg-card border border-rule flex items-center justify-center text-ink-muted shadow-sm"
        >
          <LayoutGrid size={18} />
        </Link>
      </div>
    </div>
  );
}
