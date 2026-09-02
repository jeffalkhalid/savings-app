"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SkipForward, Sparkles } from "lucide-react";
import {
  useAllTransactions,
  useAuth,
  useCategories,
  useCategoryRules,
} from "@/lib/cockpit/hooks";
import { triageQueue, frequentCategories, unsortedIdsFor } from "@/lib/cockpit/triage";
import type { TriageMerchant } from "@/lib/cockpit/triage";
import { updateTransactionsCategory } from "@/lib/cockpit/transactions-api";
import { setCategoryRules } from "@/lib/cockpit/category-rules-api";
import { CategoryPickerSheet } from "@/components/cockpit/CategoryPickerSheet";
import { tooltipMonthLabel, eur } from "@/lib/cockpit/format";
import type { Txn } from "@/lib/cockpit/types";

const SUGGESTED_COUNT = 5;
const FALLBACK_NAME = "Autres";

// Ordre d'affichage fixe de la répartition par type, et accord pluriel FR.
const TYPE_LABELS: Record<Txn["type"], [string, string]> = {
  expense: ["dépense", "dépenses"],
  income: ["revenu", "revenus"],
  transfer: ["virement", "virements"],
  savings: ["ligne d'épargne", "lignes d'épargne"],
};
const TYPE_ORDER: Txn["type"][] = ["expense", "income", "transfer", "savings"];

export default function TriPage() {
  const user = useAuth();
  const { txns, loading, error, refetch } = useAllTransactions();
  const { categories } = useCategories();
  const { rules, loaded: rulesLoaded, refetch: refetchRules } =
    useCategoryRules(user.id);

  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{
    key: string;
    label: string;
    message: string;
  } | null>(null);
  const [justApplied, setJustApplied] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Vrai une fois que l'historique a été chargé au moins une fois. À la
  // différence de `loading` (qui repasse à true à chaque refetch après une
  // décision), celui-ci ne redescend jamais : sans lui, la carte se
  // démonterait et réapparaîtrait à chaque tap (« Chargement… » entre chaque
  // décision), et l'état vide « Tout est trié » clignoterait avant le tout
  // premier chargement.
  const [txnsLoadedOnce, setTxnsLoadedOnce] = useState(false);
  useEffect(() => {
    if (!loading) setTxnsLoadedOnce(true);
  }, [loading]);

  const activeCategories = useMemo(
    () => categories.filter((c) => c.active !== false),
    [categories]
  );
  // Catégories choisissables sur cet écran (actives) : pour les chips, le
  // sélecteur complet, et les gates de `suggest`.
  const categoryNameById = useMemo(
    () => new Map(activeCategories.map((c) => [c.id, c.name])),
    [activeCategories]
  );
  // TOUTES les catégories, actives ou archivées : archiver une catégorie
  // (CategoriesModal) est un affichage, pas une suppression, les
  // transactions gardent leur category_id. Le prédicat « non classé » doit
  // lire cette map complète — sans quoi une ligne déjà classée dans une
  // catégorie archivée entre dans la file, et un tap réécrit silencieusement
  // une décision antérieure (catégorie ET type) sur tout l'historique.
  const knownNames = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  );
  const choosableNames = useMemo(
    () => new Set(categoryNameById.values()),
    [categoryNameById]
  );

  const queue = useMemo(
    () =>
      triageQueue({
        txns,
        categoryNameById: knownNames,
        ruledKeys: new Set(rules.keys()),
        choosableNames,
      }),
    [txns, knownNames, choosableNames, rules]
  );

  // Les commerçants passés sortent de la file affichée : sans cela le
  // compteur stagnerait et l'écran perdrait sa seule promesse.
  const remaining = useMemo(
    () => queue.filter((m) => !skipped.has(m.key)),
    [queue, skipped]
  );
  const current: TriageMerchant | null = remaining[0] ?? null;
  const remainingTotal = remaining.reduce((a, m) => a + m.total, 0);

  // La file change (nouvelle décision prise en compte, ou passage) : plus
  // aucune raison de garder le verrou posé le tour précédent. Sans cela, un
  // refetch dont le Map de règles retombe vide en silence (voir
  // `useCategoryRules.refetch`) stranderait la carte verrouillée sans issue.
  useEffect(() => {
    setJustApplied(null);
  }, [queue]);

  const frequent = useMemo(
    () => frequentCategories(txns, categoryNameById, SUGGESTED_COUNT),
    [txns, categoryNameById]
  );

  // La suggestion d'abord, puis les habitudes, sans doublon.
  const chips = useMemo(() => {
    if (!current) return [];
    const out = current.suggestion ? [current.suggestion] : [];
    for (const name of frequent) {
      if (out.length >= SUGGESTED_COUNT + 1) break;
      if (!out.includes(name)) out.push(name);
    }
    return out;
  }, [current, frequent]);

  const autresChoosable = choosableNames.has(FALLBACK_NAME);

  // Gate d'affichage : n'apparaît qu'une fois pour de bon, à la différence de
  // `loading` qui redevient true à chaque refetch déclenché par une décision.
  // `rulesLoaded` ne pose pas ce problème : `useCategoryRules.refetch` ne le
  // repasse jamais à false, il ne fait que le mettre à true en fin de charge.
  const ready = txnsLoadedOnce && rulesLoaded;

  // Le commerçant reste verrouillé tant que le refetch n'a pas fait avancer
  // la file : sans cela, une carte encore affichée après un envoi réussi
  // accepte un second clic sur un autre chip et écrase la décision qui vient
  // d'être prise.
  const locked = busy || (current !== null && current.key === justApplied);

  const apply = async (categoryName: string) => {
    if (locked) return;
    setShowAll(false);
    if (!current) return;
    const cat = activeCategories.find((c) => c.name === categoryName);
    if (!cat) return;

    // Seules les lignes non classées de ce commerçant, sur la même règle que
    // la file (`unsortedIdsFor` partage `isUnsorted` avec `triageQueue`) :
    // les autres portent une décision antérieure que ce tri n'a pas à
    // défaire, et la file ne peut pas lister un commerçant qu'on refuse
    // ensuite de déplacer.
    const ids = unsortedIdsFor(txns, current.key, knownNames);

    setBusy(true);
    setFailure(null);
    let moved = false;
    try {
      if (ids.length) {
        await updateTransactionsCategory(ids, cat.id, cat.type);
        moved = true;
      }
      await setCategoryRules(user.id, [
        { payeeKey: current.key, categoryId: cat.id },
      ]);
      // Verrouille la carte jusqu'à ce que le refetch fasse réellement
      // avancer la file : un échec ne verrouille pas, le commerçant doit
      // rester réessayable.
      setJustApplied(current.key);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      // Distinguer les deux échecs : si les lignes sont déjà déplacées, le
      // dire, sinon l'utilisateur croit que rien n'a bougé et recommence.
      // Rattaché au commerçant courant : la file peut avoir avancé avant que
      // le message ne soit lu, il doit rester lisible sous le bon libellé.
      setFailure({
        key: current.key,
        label: current.label,
        message: moved
          ? `lignes reclassées, mais la règle n'a pas pu être enregistrée : ${msg}`
          : msg,
      });
    } finally {
      setBusy(false);
      // La file est toujours recalculée depuis la base, jamais retirée de
      // l'affichage à la main.
      refetch();
      refetchRules();
    }
  };

  const skip = () => {
    if (!current) return;
    setFailure(null);
    setSkipped((s) => new Set(s).add(current.key));
  };

  const periode = (m: TriageMerchant) => {
    // `tooltipMonthLabel` (« août 25 »), pas `axisMonthLabel` (« août ») :
    // sur un historique de 13 mois ou plus, le mois seul est ambigu, deux
    // « août » sont possibles.
    const from = tooltipMonthLabel(m.firstDate.slice(0, 7));
    const to = tooltipMonthLabel(m.lastDate.slice(0, 7));
    return from === to ? `en ${from}` : `de ${from} à ${to}`;
  };

  // Répartition par type des lignes non classées, seulement quand elle mêle
  // plus d'un type : un tap réécrit `type` en même temps que la catégorie, et
  // le total en valeur absolue de la carte masque un commerçant qui à la
  // fois paie et est payé.
  const typeMix = useMemo(() => {
    if (!current) return null;
    const entries = TYPE_ORDER
      .map((ty) => [ty, current.typeCounts[ty] ?? 0] as const)
      .filter(([, n]) => n > 0);
    return entries.length > 1 ? entries : null;
  }, [current]);

  return (
    <main className="max-w-[600px] mx-auto px-5 pt-8 pb-24">
      <header className="mb-4">
        <Link href="/cockpit/commercants" className="text-ink-muted text-sm">
          ‹ Commerçants
        </Link>
        <h1 className="font-display text-2xl mt-2">Trier</h1>
        <p className="text-[13px] text-ink-muted mt-1">
          {loading || !rulesLoaded
            ? "Chargement…"
            : `Reste ${remaining.length} commerçant${
                remaining.length > 1 ? "s" : ""
              } · ${eur(remainingTotal)}`}
        </p>
      </header>

      {error && (
        <p className="text-accent text-[13px] mb-5">
          L&apos;historique des opérations n&apos;a pas pu être chargé. Réessaie
          plus tard.
        </p>
      )}

      {ready && !error && !current && (
        <div className="bg-card rounded-2xl p-6 text-center">
          <p className="text-sm text-ink mb-1">Tout est trié.</p>
          <p className="text-[12.5px] text-ink-muted mb-3">
            Chaque commerçant a une catégorie ou une règle.
          </p>
          <Link
            href="/cockpit/commercants"
            className="text-[13px] text-ink underline"
          >
            Voir les commerçants
          </Link>
        </div>
      )}

      {failure && (
        <p className="text-accent text-[12.5px] mb-3">
          {failure.label} : {failure.message}
        </p>
      )}

      {ready && !error && current && (
        <div className="bg-card rounded-2xl p-4">
          <div className="text-[15px] font-medium break-words">
            {current.label}
          </div>
          <div className="text-[12.5px] text-ink-muted mt-0.5">
            <span className="font-mono-num">{current.count}</span> opération
            {current.count > 1 ? "s" : ""} ·{" "}
            <span className="font-mono-num">{eur(current.total)}</span> ·{" "}
            {periode(current)}
          </div>

          {typeMix && (
            <div className="text-[12.5px] text-accent mt-0.5">
              {typeMix.map(([ty, n], i) => {
                const [singular, plural] = TYPE_LABELS[ty];
                return (
                  <span key={ty}>
                    {i > 0 && " · "}
                    <span className="font-mono-num">{n}</span>{" "}
                    {n > 1 ? plural : singular}
                  </span>
                );
              })}
            </div>
          )}

          {current.samples.length > 1 && (
            <div className="mt-3 pt-3 border-t border-rule">
              {/* Les exemples révèlent un regroupement abusif avant qu'on
                  classe vingt lignes d'un coup. */}
              <div className="text-[11px] uppercase tracking-wide text-ink-muted mb-1">
                Libellés regroupés
              </div>
              {current.samples.map((s) => (
                <div
                  key={s}
                  className="text-[11.5px] text-ink-muted break-words"
                >
                  {s}
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 grid gap-1.5">
            {chips.map((name) => {
              const suggested = name === current.suggestion;
              return (
                <button
                  key={name}
                  type="button"
                  disabled={locked}
                  onClick={() => apply(name)}
                  className={`flex items-center gap-2 text-left py-3 px-3 rounded-lg text-[14px] disabled:opacity-50 ${
                    suggested
                      ? "bg-emerald text-paper font-semibold"
                      : "bg-seg text-ink"
                  }`}
                >
                  {suggested && <Sparkles size={15} />}
                  {name}
                  {suggested && (
                    <span className="ml-auto text-[11.5px] opacity-80">
                      suggérée
                    </span>
                  )}
                </button>
              );
            })}
            {autresChoosable && (
              <button
                type="button"
                disabled={locked}
                onClick={() => apply(FALLBACK_NAME)}
                className="flex items-center gap-2 text-left py-3 px-3 rounded-lg text-[14px] bg-seg text-ink disabled:opacity-50"
              >
                Laisser dans Autres
              </button>
            )}
          </div>

          <div className="flex gap-3 mt-3">
            <button
              type="button"
              disabled={locked}
              onClick={() => setShowAll(true)}
              className="flex-1 text-[13px] text-ink-muted py-2.5 disabled:opacity-50"
            >
              Toutes les catégories…
            </button>
            <button
              type="button"
              onClick={skip}
              className="flex items-center gap-1.5 text-[13px] text-ink-muted py-2.5"
            >
              <SkipForward size={15} />
              Passer
            </button>
          </div>
        </div>
      )}

      {showAll && current && (
        <CategoryPickerSheet
          categories={activeCategories}
          title={`Classer ${current.label}`}
          onPick={(name) => apply(name)}
          onClose={() => setShowAll(false)}
        />
      )}
    </main>
  );
}
