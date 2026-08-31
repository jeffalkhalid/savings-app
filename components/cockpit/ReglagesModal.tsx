"use client";

import { useState } from "react";
import { saveUserSettings } from "@/lib/cockpit/user-settings-api";
import { CURRENCIES, type UserSettings } from "@/lib/cockpit/settings";
import { useTheme } from "@/components/cockpit/ThemeProvider";
import { supabase } from "@/lib/cockpit/supabase";
import type { ThemePref } from "@/lib/cockpit/theme";
import type { Category, Txn } from "@/lib/cockpit/types";
import { CategoriesModal } from "@/components/cockpit/CategoriesModal";
import { useIsAdmin } from "@/lib/cockpit/hooks";
import { AdminsModal } from "@/components/cockpit/AdminsModal";
import { SalaryShiftModal } from "@/components/cockpit/SalaryShiftModal";
import { planRekey } from "@/lib/cockpit/recurring-rekey";
import {
  listAllRecurringCharges,
  updateRecurringChargeKey,
  deleteRecurringCharges,
} from "@/lib/cockpit/recurring-charges-api";

const THEME_OPTS: { v: ThemePref; label: string }[] = [
  { v: "light", label: "Clair" },
  { v: "dark", label: "Sombre" },
  { v: "system", label: "Système" },
];

export function ReglagesModal({
  userId,
  settings,
  categories,
  allTxns,
  onClose,
  onSaved,
  onCategoriesChanged,
}: {
  userId: string;
  settings: UserSettings;
  categories: Category[];
  allTxns: Txn[];
  onClose: () => void;
  onSaved: () => void;
  onCategoriesChanged: () => void;
}) {
  const { pref, setPref } = useTheme();
  const [goalPct, setGoalPct] = useState(
    String(Math.round(settings.savings_rate_goal * 100))
  );
  const [currency, setCurrency] = useState(settings.reporting_currency);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showCategories, setShowCategories] = useState(false);
  const { isAdmin } = useIsAdmin();
  const [showAdmins, setShowAdmins] = useState(false);
  const [showSalaryShift, setShowSalaryShift] = useState(false);
  const [rekeying, setRekeying] = useState(false);
  const [rekeyNote, setRekeyNote] = useState("");

  const rekey = async () => {
    setRekeying(true);
    setRekeyNote("");
    let plan: { updates: { id: string; payeeKey: string }[]; deletes: string[] } | null =
      null;
    let deletesApplied = false;
    let rekeyed = 0;
    try {
      const charges = await listAllRecurringCharges(userId);
      plan = planRekey(charges);
      await deleteRecurringCharges(plan.deletes);
      deletesApplied = true;
      for (const u of plan.updates) {
        await updateRecurringChargeKey(u.id, u.payeeKey);
        rekeyed++;
      }
      setRekeyNote(
        `${charges.length} engagement(s), ${plan.updates.length} re-clé(s), ${plan.deletes.length} fusionné(s).`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      if (plan && deletesApplied) {
        setRekeyNote(
          `Migration interrompue après ${rekeyed} re-clé(s) sur ${plan.updates.length}, et ${plan.deletes.length} fusion(s) déjà appliquée(s). Relancez : l'opération reprend là où elle s'est arrêtée. (${msg})`
        );
      } else {
        setRekeyNote(msg);
      }
    }
    setRekeying(false);
  };

  const field = "border border-rule rounded-lg px-3 py-3 bg-card text-ink text-base w-full";
  const labelCls = "grid gap-1.5 text-[13px] text-ink-muted";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const g = parseFloat(goalPct.replace(",", "."));
    if (!isFinite(g) || g <= 0) {
      setError("Objectif invalide");
      return;
    }
    setSaving(true);
    try {
      await saveUserSettings(userId, {
        savingsRateGoal: g / 100,
        reportingCurrency: currency,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setSaving(false);
    }
  };

  return (
    <>
    <div
      className="fixed inset-0 z-[1000] bg-black/50 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="bg-paper w-full max-w-[600px] max-h-[90vh] overflow-auto px-6 pt-6 pb-10 rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-center mb-4">
          <h2 className="font-display text-2xl">Réglages</h2>
          <button className="text-ink-muted text-sm" onClick={onClose} type="button">
            Fermer
          </button>
        </header>
        <form onSubmit={submit} className="grid gap-4">
          <div className={labelCls}>
            Thème
            <div className="flex gap-1 bg-seg rounded-xl p-1">
              {THEME_OPTS.map((o) => {
                const on = pref === o.v;
                return (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setPref(o.v)}
                    className={`flex-1 rounded-lg py-2 text-[13px] font-medium ${
                      on ? "bg-card text-ink" : "text-ink-muted"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
          <label className={labelCls}>
            Objectif de taux d&apos;épargne (%)
            <input
              className={field}
              type="text"
              inputMode="decimal"
              value={goalPct}
              onChange={(e) => setGoalPct(e.target.value)}
              required
            />
          </label>
          <label className={labelCls}>
            Devise de reporting
            <select
              className={field}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <button
            className="bg-emerald text-[#FBF3EC] rounded-lg py-3.5 font-semibold disabled:opacity-60"
            type="submit"
            disabled={saving}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
          {error && <p className="text-accent text-sm">{error}</p>}
          <button
            type="button"
            onClick={() => setShowCategories(true)}
            className="text-ink text-sm py-2 border-t border-rule pt-4 text-left"
          >
            Gérer les catégories
          </button>
          <button
            type="button"
            onClick={() => setShowSalaryShift(true)}
            className="text-ink text-sm py-2 text-left"
          >
            Salaire rattaché au mois suivant
          </button>
          <button
            type="button"
            onClick={rekey}
            disabled={rekeying}
            className="text-ink text-sm py-2 text-left disabled:opacity-60"
          >
            {rekeying ? "Recalcul…" : "Recalculer les clés d'engagement"}
          </button>
          {rekeyNote && <p className="text-[13px] text-ink-muted">{rekeyNote}</p>}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowAdmins(true)}
              className="text-ink text-sm py-2 text-left"
            >
              Gérer les admins
            </button>
          )}
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="text-accent text-sm py-2 mt-2 border-t border-rule pt-4"
          >
            Déconnexion
          </button>
        </form>
      </div>
    </div>
    {showCategories && (
      <CategoriesModal
        userId={userId}
        categories={categories}
        onChanged={onCategoriesChanged}
        onClose={() => setShowCategories(false)}
      />
    )}
    {showAdmins && (
      <AdminsModal userId={userId} onClose={() => setShowAdmins(false)} />
    )}
    {showSalaryShift && (
      <SalaryShiftModal
        userId={userId}
        shift={settings.salary_shift}
        categories={categories}
        allTxns={allTxns}
        onClose={() => setShowSalaryShift(false)}
        onSaved={() => {
          onSaved();
          setShowSalaryShift(false);
        }}
      />
    )}
    </>
  );
}
