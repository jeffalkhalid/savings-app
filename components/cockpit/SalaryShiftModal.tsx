"use client";

import { useMemo, useState } from "react";
import type { Category, Txn } from "@/lib/cockpit/types";
import {
  isShifted,
  type SalaryShift,
} from "@/lib/cockpit/budget-month";
import { merchantKey } from "@/lib/cockpit/payee-key";
import { saveSalaryShift } from "@/lib/cockpit/user-settings-api";

export function SalaryShiftModal({
  userId,
  shift,
  categories,
  allTxns,
  onClose,
  onSaved,
}: {
  userId: string;
  shift: SalaryShift;
  categories: Category[];
  allTxns: Txn[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<SalaryShift>(() => ({
    payeeKeys: [...shift.payeeKeys],
    categoryIds: [...shift.categoryIds],
    days: shift.days,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const incomeCategories = useMemo(
    () => categories.filter((c) => c.type === "income" && c.active !== false),
    [categories]
  );

  /** Payeurs candidats : les commerçants distincts des revenus de l'utilisateur. */
  const payeeOptions = useMemo(() => {
    const seen = new Map<string, { label: string; n: number }>();
    for (const t of allTxns) {
      if (t.type !== "income") continue;
      const key = merchantKey(t.description);
      if (!key) continue;
      const cur = seen.get(key) ?? { label: t.description, n: 0 };
      cur.n += 1;
      seen.set(key, cur);
    }
    return [...seen.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .map(([key, v]) => ({ key, label: v.label, n: v.n }));
  }, [allTxns]);

  const preview = useMemo(
    () => allTxns.filter((t) => isShifted(t, draft)).length,
    [allTxns, draft]
  );

  const toggle = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await saveSalaryShift(userId, draft);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setSaving(false);
    }
  };

  const labelCls = "text-[13px] text-ink-muted";

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/50 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="bg-paper w-full max-w-[600px] max-h-[90vh] overflow-auto px-6 pt-6 pb-10 rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-center mb-4">
          <h2 className="font-display text-2xl">Salaire rattaché au mois suivant</h2>
          <button className="text-ink-muted text-sm" onClick={onClose} type="button">
            Fermer
          </button>
        </header>

        <p className="text-[13px] text-ink-muted mb-5">
          Un revenu de la catégorie choisie, versé par l&apos;un des payeurs cochés dans les
          derniers jours du mois, comptera pour le mois suivant. Sa date n&apos;est pas modifiée.
        </p>

        <form onSubmit={submit} className="grid gap-6">
          <section className="grid gap-2">
            <h3 className="text-[13px] font-semibold text-ink">Catégories</h3>
            {incomeCategories.length === 0 && (
              <p className={labelCls}>Aucune catégorie de revenu.</p>
            )}
            {incomeCategories.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-[15px] text-ink">
                <input
                  type="checkbox"
                  checked={draft.categoryIds.includes(c.id)}
                  onChange={() =>
                    setDraft((d) => ({ ...d, categoryIds: toggle(d.categoryIds, c.id) }))
                  }
                />
                {c.name}
              </label>
            ))}
          </section>

          <section className="grid gap-2">
            <h3 className="text-[13px] font-semibold text-ink">Payeurs</h3>
            {payeeOptions.length === 0 && (
              <p className={labelCls}>Aucun revenu dans l&apos;historique.</p>
            )}
            {payeeOptions.slice(0, 20).map((p) => (
              <label key={p.key} className="flex items-start gap-2 text-[15px] text-ink">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={draft.payeeKeys.includes(p.key)}
                  onChange={() =>
                    setDraft((d) => ({ ...d, payeeKeys: toggle(d.payeeKeys, p.key) }))
                  }
                />
                <span className="min-w-0">
                  <span className="block truncate">{p.label}</span>
                  <span className={labelCls}>
                    {p.n} opération{p.n > 1 ? "s" : ""}
                  </span>
                </span>
              </label>
            ))}
          </section>

          <label className="grid gap-1.5">
            <span className={labelCls}>
              Fenêtre de fin de mois : {draft.days} jour{draft.days > 1 ? "s" : ""}
            </span>
            <input
              type="range"
              min={1}
              max={15}
              step={1}
              value={draft.days}
              onChange={(e) => setDraft((d) => ({ ...d, days: Number(e.target.value) }))}
            />
          </label>

          <p className="text-[13px] text-ink">
            <span className="font-mono-num">{preview}</span> opération
            {preview > 1 ? "s" : ""} de votre historique
            {preview > 1 ? " seraient rattachées" : " serait rattachée"} au mois suivant.
          </p>

          {error && <p className="text-accent text-sm">{error}</p>}

          <button
            className="bg-emerald text-[#FBF3EC] rounded-lg py-3.5 font-semibold disabled:opacity-60"
            type="submit"
            disabled={saving}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </form>
      </div>
    </div>
  );
}
