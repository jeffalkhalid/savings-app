"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  useAllTransactions,
  useAuth,
  useCategories,
  useRecurringCharges,
} from "@/lib/cockpit/hooks";
import { merchantDrifts, MIN_ANNUAL, MIN_MONTHS } from "@/lib/cockpit/drift";
import type { Drift } from "@/lib/cockpit/drift";
import { detectRecurring } from "@/lib/cockpit/recurring-detect";
import { merchantKey } from "@/lib/cockpit/payee-key";
import { merchantSeries } from "@/lib/cockpit/merchants";
import {
  createRecurringCharge,
  updateRecurringCharge,
  listAllRecurringCharges,
} from "@/lib/cockpit/recurring-charges-api";
import { useBulkRecategorise } from "@/lib/cockpit/use-bulk-recategorise";
import { useBulkDelete } from "@/lib/cockpit/use-bulk-delete";
import { CategoryPickerSheet } from "@/components/cockpit/CategoryPickerSheet";
import { ConfirmDeleteSheet } from "@/components/cockpit/ConfirmDeleteSheet";
import { MerchantSheet } from "@/components/cockpit/MerchantSheet";
import { DriftRow } from "@/components/cockpit/DriftRow";
import { currentMonth, eur, todayISO } from "@/lib/cockpit/format";

export default function DerivePage() {
  const user = useAuth();
  const { txns, loading, error, refetch } = useAllTransactions();
  const { categories } = useCategories();
  const { charges, loading: chargesLoading, refetch: refetchCharges } =
    useRecurringCharges();

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [drillQuery, setDrillQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [noteIsError, setNoteIsError] = useState(false);

  const bulk = useBulkRecategorise(user.id, refetch);
  const del = useBulkDelete(refetch);

  const drifts = useMemo(() => merchantDrifts(txns, todayISO()), [txns]);

  // Les engagements confirmés, par clé : c'est ce qui répartit les dérives
  // entre les deux sections.
  const chargeByKey = useMemo(
    () => new Map(charges.map((c) => [c.payee_key, c])),
    [charges]
  );

  // Une récurrence qui s'est arrêtée il y a six mois n'a pas à être proposée
  // au suivi, même si sa dérive passée passe les seuils.
  const recurringKeys = useMemo(
    () => new Set(detectRecurring(txns, currentMonth()).map((c) => c.payeeKey)),
    [txns]
  );

  const suivis = useMemo(
    () => drifts.filter((d) => chargeByKey.has(d.key)),
    [drifts, chargeByKey]
  );
  const nonSuivis = useMemo(
    () =>
      drifts.filter((d) => !chargeByKey.has(d.key) && recurringKeys.has(d.key)),
    [drifts, chargeByKey, recurringKeys]
  );

  const selectedTxns = useMemo(
    () =>
      selectedKey
        ? txns.filter((t) => merchantKey(t.description) === selectedKey)
        : [],
    [txns, selectedKey]
  );
  const series = useMemo(
    () => (selectedKey ? merchantSeries(txns, selectedKey) : []),
    [txns, selectedKey]
  );
  const selectedLabel =
    drifts.find((d) => d.key === selectedKey)?.label ?? selectedKey ?? "";

  const openSheet = (key: string) => {
    setSelectedKey(key);
    setDrillQuery("");
  };
  const closeSheet = () => {
    setSelectedKey(null);
    setDrillQuery("");
  };

  const recale = async (d: Drift) => {
    const charge = chargeByKey.get(d.key);
    if (!charge) return;
    setBusy(true);
    setNoteIsError(false);
    try {
      await updateRecurringCharge(charge.id, {
        label: charge.label,
        expectedAmount: d.recent,
        active: true,
      });
      setNote(`${charge.label} attendu à ${eur(d.recent)}`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Erreur");
      setNoteIsError(true);
    } finally {
      setBusy(false);
      refetchCharges();
    }
  };

  // Une récurrence suivie puis renommée par l'utilisateur, ensuite désactivée,
  // ne doit pas voir son nom écrasé par le libellé brut de la banque quand on
  // la reprend : on cherche d'abord la ligne inactive et on garde son label.
  const suivre = async (d: Drift) => {
    setBusy(true);
    setNoteIsError(false);
    try {
      const all = await listAllRecurringCharges(user.id);
      const existing = all.find((c) => c.payee_key === d.key);
      if (existing) {
        await updateRecurringCharge(existing.id, {
          label: existing.label,
          expectedAmount: d.recent,
          active: true,
        });
        setNote(`${existing.label} réactivé à ${eur(d.recent)}`);
      } else {
        await createRecurringCharge(user.id, {
          payeeKey: d.key,
          label: d.label,
          expectedAmount: d.recent,
        });
        setNote(`${d.label} suivi à ${eur(d.recent)}`);
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Erreur");
      setNoteIsError(true);
    } finally {
      setBusy(false);
      refetchCharges();
    }
  };

  const ready = !loading && !chargesLoading;

  return (
    <main className="max-w-[600px] mx-auto px-5 pt-8 pb-24">
      {selectedKey ? (
        <MerchantSheet
          label={selectedLabel}
          series={series}
          txns={selectedTxns}
          categories={categories.filter((c) => c.active !== false)}
          query={drillQuery}
          onQuery={setDrillQuery}
          onBack={closeSheet}
          onBulkCategorise={bulk.start}
          onBulkDelete={del.start}
        />
      ) : (
        <>
          <header className="mb-4">
            <Link href="/cockpit" className="text-ink-muted text-sm">
              ‹ Cockpit
            </Link>
            <h1 className="font-display text-2xl mt-2">Dérive</h1>
            <p className="text-[13px] text-ink-muted mt-1">
              {ready
                ? "Les abonnements dont le montant monte, et ce que la hausse coûte sur un an."
                : "Chargement…"}
            </p>
          </header>

          {note && (
            <p
              className={`text-[13px] mb-3 ${
                noteIsError ? "text-accent" : "text-emerald"
              }`}
            >
              {note}
            </p>
          )}

          {error && (
            <p className="text-accent text-[13px] mb-5">
              L&apos;historique des opérations n&apos;a pas pu être chargé.
              Réessaie plus tard.
            </p>
          )}

          {ready && !error && (
            <>
              <h2 className="font-display text-[15px] mb-2">
                Engagements suivis
              </h2>
              {suivis.length ? (
                suivis.map((d) => (
                  <DriftRow
                    key={d.key}
                    drift={d}
                    actionVerb="Recaler"
                    actionAmount={d.recent}
                    onAction={() => recale(d)}
                    onOpen={() => openSheet(d.key)}
                    busy={busy}
                  />
                ))
              ) : (
                <p className="text-ink-muted text-sm mb-5">
                  Aucun engagement suivi n&apos;a {MIN_MONTHS} mois
                  d&apos;historique, une hausse régulière et au moins{" "}
                  {MIN_ANNUAL} € d&apos;écart sur un an.
                </p>
              )}

              <h2 className="font-display text-[15px] mt-6 mb-2">
                Récurrences non suivies
              </h2>
              {nonSuivis.length ? (
                nonSuivis.map((d) => (
                  <DriftRow
                    key={d.key}
                    drift={d}
                    actionVerb="Suivre"
                    actionAmount={d.recent}
                    onAction={() => suivre(d)}
                    onOpen={() => openSheet(d.key)}
                    busy={busy}
                  />
                ))
              ) : (
                <p className="text-ink-muted text-sm">
                  Aucune récurrence non suivie ne dérive assez pour appeler une
                  action.
                </p>
              )}
            </>
          )}
        </>
      )}

      {bulk.note && (
        <p
          className={`text-[13px] mt-3 ${
            bulk.noteIsError ? "text-accent" : "text-emerald"
          }`}
        >
          {bulk.note}
        </p>
      )}
      {bulk.pending && (
        <CategoryPickerSheet
          categories={categories.filter((c) => c.active !== false)}
          title={`Reclasser ${bulk.pending.length} opération${
            bulk.pending.length > 1 ? "s" : ""
          }`}
          onPick={(name) => bulk.apply(name, categories)}
          onClose={bulk.cancel}
        />
      )}
      {del.note && <p className="text-[13px] mt-3 text-emerald">{del.note}</p>}
      {del.pending && (
        <ConfirmDeleteSheet
          txns={del.pending}
          busy={del.busy}
          error={del.error}
          onConfirm={del.confirm}
          onClose={del.cancel}
        />
      )}
    </main>
  );
}
