"use client";

import { useMemo, useState } from "react";
import { currentMonth } from "@/lib/cockpit/format";
import Link from "next/link";
import {
  useAllTransactions,
  useAuth,
  useCategories,
  useUserSettings,
} from "@/lib/cockpit/hooks";
import {
  monthlyTotals,
  monthlyByCategory,
  topCategories,
  withoutCurrentMonth,
} from "@/lib/cockpit/timeline";
import { TimelineChart } from "@/components/cockpit/TimelineChart";
import { SavingsRateChart } from "@/components/cockpit/SavingsRateChart";
import { CategoryChart } from "@/components/cockpit/CategoryChart";

type Vue = "ensemble" | "categories";

const VUES: { v: Vue; label: string }[] = [
  { v: "ensemble", label: "Vue d'ensemble" },
  { v: "categories", label: "Par catégorie" },
];

export default function EvolutionPage() {
  const user = useAuth();
  const { txns, loading } = useAllTransactions();
  const { categories } = useCategories();
  const { settings, loaded: settingsLoaded } = useUserSettings(user.id);
  const ready = !loading && settingsLoaded;
  const [vue, setVue] = useState<Vue>("ensemble");
  const [picked, setPicked] = useState<string[] | null>(null);

  const shift = settings.salary_shift;

  // Le mois en cours est exclu des courbes : non terminé, il produirait un
  // dernier point effondré qui se lit comme une chute réelle. Son suivi relève
  // du Cockpit, pas d'une courbe d'historique.
  const nowMonth = currentMonth();
  const totals = useMemo(
    () => withoutCurrentMonth(monthlyTotals(txns, shift), nowMonth),
    [txns, shift, nowMonth]
  );

  // Sélection par défaut : les cinq postes les plus lourds. `null` signifie
  // « pas encore choisi par l'utilisateur », ce qui laisse le défaut se
  // recalculer quand les transactions arrivent.
  const defaultIds = useMemo(
    () => topCategories(txns, 5),
    [txns]
  );
  const selectedIds = picked ?? defaultIds;

  const catSeries = useMemo(
    () =>
      withoutCurrentMonth(
        monthlyByCategory(txns, shift, selectedIds),
        nowMonth
      ),
    [txns, shift, selectedIds, nowMonth]
  );
  const selectedCats = useMemo(
    () => categories.filter((c) => selectedIds.includes(c.id)),
    [categories, selectedIds]
  );

  // Catégories proposées à la case à cocher : celles qui ont au moins une
  // dépense, pour ne pas noyer la liste sous des catégories jamais utilisées.
  const offered = useMemo(() => {
    const used = new Set(topCategories(txns, Number.MAX_SAFE_INTEGER));
    return categories.filter((c) => used.has(c.id));
  }, [categories, txns]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const base = prev ?? defaultIds;
      return base.includes(id)
        ? base.filter((x) => x !== id)
        : [...base, id];
    });

  return (
    <main className="max-w-[600px] mx-auto px-5 pt-8 pb-24">
      <header className="mb-4">
        <Link href="/cockpit" className="text-ink-muted text-sm">
          ‹ Cockpit
        </Link>
        <h1 className="font-display text-2xl mt-2">Évolution</h1>
        <p className="text-[13px] text-ink-muted mt-1">
          {!ready ? (
            "Chargement…"
          ) : (
            <>
              <span className="font-mono-num">{totals.length}</span> mois
              d&apos;historique · mois en cours exclu
            </>
          )}
        </p>
      </header>

      <div className="flex gap-1 bg-seg rounded-xl p-1 mb-4">
        {VUES.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => setVue(o.v)}
            className={`flex-1 rounded-lg py-2 text-[13px] font-medium ${
              vue === o.v ? "bg-card text-ink" : "text-ink-muted"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {ready && totals.length < 2 && (
        <p className="text-[13px] text-ink-muted">
          Il faut au moins deux mois d&apos;historique pour tracer une évolution.
        </p>
      )}

      {ready &&
        (vue === "ensemble" ? (
          <>
            <TimelineChart series={totals} />
            <SavingsRateChart series={totals} />
          </>
        ) : (
          <>
            {categories.length === 0 ? (
              <p className="text-[13px] text-ink-muted mb-4">
                Chargement des catégories…
              </p>
            ) : selectedIds.length === 0 ? (
              <p className="text-[13px] text-ink-muted mb-4">
                Aucune catégorie sélectionnée.
              </p>
            ) : catSeries.length < 2 ? (
              <p className="text-[13px] text-ink-muted mb-4">
                Pas assez d&apos;historique sur cette sélection pour tracer
                une évolution.
              </p>
            ) : (
              <CategoryChart series={catSeries} categories={selectedCats} />
            )}
            <div className="grid gap-1.5">
              {offered.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2 text-[15px] text-ink"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(c.id)}
                    onChange={() => toggle(c.id)}
                  />
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: c.color }}
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </>
        ))}
    </main>
  );
}
