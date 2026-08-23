"use client";

import { useState } from "react";
import { Plus, Trash2, RotateCcw } from "lucide-react";
import {
  baremeError,
  cloneBareme,
  DEFAULT_BAREME,
  SOURCE_KEYS,
  SOURCE_LABELS,
  type AbondementBareme,
  type SourceKey,
  type Tranche,
} from "@/lib/abondement";
import { saveAbondementBareme } from "@/lib/cockpit/user-settings-api";

type PlanKey = "peg" | "per";

const PLAN_OPTS: { v: PlanKey; label: string }[] = [
  { v: "peg", label: "PEG" },
  { v: "per", label: "PER" },
];

export function BaremeModal({
  userId,
  bareme,
  onClose,
  onSaved,
}: {
  userId: string;
  bareme: AbondementBareme;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<AbondementBareme>(() => cloneBareme(bareme));
  const [plan, setPlan] = useState<PlanKey>("peg");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Overlay: raw in-progress text per input, keyed by `${plan}-${source}-${i}-<field>`.
  // Lets the user type transient text (e.g. "12." while writing "12.5") without the
  // numeric-model round-trip snapping it back on every keystroke. Cleared whenever the
  // tranche list structure changes (add/remove) or on reset/save, so fields re-derive
  // cleanly from the model.
  const [edits, setEdits] = useState<Record<string, string>>({});

  const field =
    "border border-rule rounded-lg px-3 py-2.5 bg-card text-ink text-base w-full font-mono-num";
  const labelCls = "text-[13px] text-ink-muted";

  const patch = (source: SourceKey, next: Tranche[]) => {
    setDraft((d) => ({ ...d, [plan]: { ...d[plan], [source]: next } }));
  };

  const setTranche = (source: SourceKey, i: number, t: Partial<Tranche>) => {
    const next = draft[plan][source].map((row, j) =>
      j === i ? { ...row, ...t } : row
    );
    patch(source, next);
  };

  const addTranche = (source: SourceKey) => {
    const rows = draft[plan][source];
    const last = rows[rows.length - 1];
    const hasTrailingOpen = rows.length > 0 && last.upTo === null;
    // Seuil borné, strictement supérieur au seuil précédent (règle de validation) :
    // 1000 € au-dessus du dernier seuil connu, ou 1000 € si la liste est vide.
    const previousUpTo = rows
      .slice(0, hasTrailingOpen ? rows.length - 1 : rows.length)
      .reduce((max, t) => (t.upTo !== null && t.upTo > max ? t.upTo : max), 0);
    const newTranche: Tranche = { upTo: previousUpTo + 1000, rate: 0 };
    const next = hasTrailingOpen
      ? [...rows.slice(0, -1), newTranche, last]
      : [...rows, newTranche];
    patch(source, next);
    setEdits({});
  };

  const removeTranche = (source: SourceKey, i: number) => {
    patch(
      source,
      draft[plan][source].filter((_, j) => j !== i)
    );
    setEdits({});
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = baremeError(draft);
    if (err) {
      setError(err);
      return;
    }
    setError("");
    setSaving(true);
    try {
      await saveAbondementBareme(userId, draft);
      setEdits({});
      onSaved();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Erreur");
      setSaving(false);
    }
  };

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
          <h2 className="font-display text-2xl">Barème d&apos;abondement</h2>
          <button className="text-ink-muted text-sm" onClick={onClose} type="button">
            Fermer
          </button>
        </header>

        <p className="text-[13px] text-ink-muted mb-4">
          Ce que votre employeur ajoute à vos versements, par tranche. Laissez le
          seuil vide pour « au-delà ».
        </p>

        <div className="flex gap-1 bg-seg rounded-xl p-1 mb-5">
          {PLAN_OPTS.map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setPlan(o.v)}
              className={`flex-1 rounded-lg py-2 text-[13px] font-medium ${
                plan === o.v ? "bg-card text-ink" : "text-ink-muted"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="grid gap-6">
          {SOURCE_KEYS.map((source) => {
            const rows = draft[plan][source];
            return (
              <section key={source} className="grid gap-2">
                <h3 className="text-[13px] font-semibold text-ink">
                  {SOURCE_LABELS[source]}
                </h3>
                {rows.length === 0 && (
                  <p className="text-[13px] text-ink-muted">Pas d&apos;abondement.</p>
                )}
                {rows.map((t, i) => {
                  const upToKey = `${plan}-${source}-${i}-upTo`;
                  const rateKey = `${plan}-${source}-${i}-rate`;
                  const upToDisplay =
                    edits[upToKey] ?? (t.upTo === null ? "" : String(t.upTo));
                  const rateDisplay =
                    edits[rateKey] ?? String(Math.round(t.rate * 1000) / 10);
                  return (
                    <div key={i} className="flex items-end gap-2">
                      <label className="grid gap-1 flex-1">
                        <span className={labelCls}>Jusqu&apos;à (€)</span>
                        <input
                          className={field}
                          type="text"
                          inputMode="decimal"
                          placeholder="au-delà"
                          value={upToDisplay}
                          onChange={(e) => {
                            const text = e.target.value;
                            setEdits((prev) => ({ ...prev, [upToKey]: text }));
                            const raw = text.replace(",", ".").trim();
                            setTranche(source, i, {
                              upTo: raw === "" ? null : parseFloat(raw) || 0,
                            });
                          }}
                        />
                      </label>
                      <label className="grid gap-1 flex-1">
                        <span className={labelCls}>Taux (%)</span>
                        <input
                          className={field}
                          type="text"
                          inputMode="decimal"
                          value={rateDisplay}
                          onChange={(e) => {
                            const text = e.target.value;
                            setEdits((prev) => ({ ...prev, [rateKey]: text }));
                            const raw = text.replace(",", ".").trim();
                            setTranche(source, i, {
                              rate: (parseFloat(raw) || 0) / 100,
                            });
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        aria-label="Supprimer la tranche"
                        onClick={() => removeTranche(source, i)}
                        className="text-ink-muted p-2.5"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => addTranche(source)}
                  className="flex items-center gap-1.5 text-[13px] text-ink-muted py-1 justify-self-start"
                >
                  <Plus size={14} />
                  Ajouter une tranche
                </button>
              </section>
            );
          })}

          {error && <p className="text-accent text-sm">{error}</p>}

          <button
            className="bg-emerald text-[#FBF3EC] rounded-lg py-3.5 font-semibold disabled:opacity-60"
            type="submit"
            disabled={saving}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(cloneBareme(DEFAULT_BAREME));
              setEdits({});
              setError("");
            }}
            className="flex items-center gap-1.5 text-ink-muted text-sm justify-center"
          >
            <RotateCcw size={14} />
            Réinitialiser (Carrefour)
          </button>
        </form>
      </div>
    </div>
  );
}
