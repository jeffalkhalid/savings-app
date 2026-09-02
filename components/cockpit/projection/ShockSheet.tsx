"use client";

import { useEffect, useState } from "react";
import { eur } from "@/lib/cockpit/format";
import type { Shock } from "@/lib/cockpit/shock";

const KINDS: { v: Shock["kind"]; label: string }[] = [
  { v: "revenu", label: "Perte de revenu" },
  { v: "depense", label: "Dépense exceptionnelle" },
  { v: "charges", label: "Hausse durable des charges" },
  { v: "krach", label: "Krach de marché" },
];

export function ShockSheet({
  years,
  monthlyIncome,
  onAdd,
  onClose,
}: {
  years: number;
  monthlyIncome: number;
  onAdd: (s: Shock) => void;
  onClose: () => void;
}) {
  const maxMonth = years * 12;
  const noIncome = monthlyIncome === 0;
  // Sans revenu mesuré, « Perte de revenu » serait un no-op silencieux : on
  // n'ouvre jamais la feuille sur ce choix-là dans ce cas.
  const [kind, setKind] = useState<Shock["kind"]>(noIncome ? "depense" : "revenu");
  // Clampé à la fenêtre affichable : un choc daté au-delà de l'horizon serait
  // accepté mais ne jouerait jamais.
  const [start, setStart] = useState(Math.min(12, maxMonth));
  const [months, setMonths] = useState(6);
  const [keep, setKeep] = useState(0);
  const [amount, setAmount] = useState(15000);
  const [monthly, setMonthly] = useState(250);
  const [drop, setDrop] = useState(30);

  // Si l'horizon rétrécit pendant que la feuille est ouverte, la date posée
  // peut se retrouver au-delà du nouveau maximum : on la ramène dans la
  // fenêtre plutôt que de laisser un choc qui ne jouera jamais.
  useEffect(() => {
    setStart((s) => Math.min(s, maxMonth));
  }, [maxMonth]);

  const build = (): Shock => {
    if (kind === "revenu")
      return { kind, startMonth: start, months, keepPct: keep / 100 };
    if (kind === "depense") return { kind, atMonth: start, amount };
    if (kind === "charges") return { kind, startMonth: start, monthly };
    return { kind: "krach", atMonth: start, dropPct: drop / 100 };
  };

  const field = "grid gap-1.5 text-[13px] text-ink-muted";
  const input =
    "bg-tile rounded-lg px-3 py-2.5 text-ink text-[15px] font-mono-num outline-none";

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/50 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="bg-paper w-full max-w-[600px] max-h-[85vh] overflow-auto px-6 pt-6 pb-10 rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-center mb-4">
          <h2 className="font-display text-xl">Ajouter un choc</h2>
          <button type="button" className="text-ink-muted text-sm" onClick={onClose}>
            Fermer
          </button>
        </header>

        <div className="grid gap-1.5 mb-5">
          {KINDS.map((k) => {
            const disabled = k.v === "revenu" && noIncome;
            return (
              <div key={k.v}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setKind(k.v)}
                  className={`w-full text-left py-3 px-3 rounded-lg text-[14px] ${
                    disabled
                      ? "bg-seg text-ink-muted opacity-50"
                      : kind === k.v
                        ? "bg-emerald text-paper font-semibold"
                        : "bg-seg text-ink"
                  }`}
                >
                  {k.label}
                </button>
                {disabled && (
                  <p className="text-[11.5px] text-ink-muted mt-1 px-1">
                    Aucun revenu mesuré dans l&apos;historique.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="grid gap-4">
          <label className={field}>
            {kind === "charges" || kind === "revenu" ? "À partir de" : "Quand"} ·
            dans <span className="font-mono-num">{start}</span> mois
            <input
              type="range"
              // min=1 et non 0 : le moteur seed le mois 0 avant sa boucle
              // (`out = [{ month: 0, value: initial }]`), donc un choc ponctuel
              // daté du mois 0 ne serait jamais appliqué.
              min={1}
              max={maxMonth}
              step={1}
              value={start}
              onChange={(e) => setStart(Number(e.target.value))}
            />
          </label>

          {kind === "revenu" && (
            <>
              <label className={field}>
                Durée · <span className="font-mono-num">{months}</span> mois
                <input
                  type="range"
                  min={1}
                  max={36}
                  step={1}
                  value={months}
                  onChange={(e) => setMonths(Number(e.target.value))}
                />
              </label>
              <label className={field}>
                Revenu maintenu · <span className="font-mono-num">{keep}</span> %
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={keep}
                  onChange={(e) => setKeep(Number(e.target.value))}
                />
              </label>
              <p className="text-[13px] text-ink-muted -mt-2">
                <span className="font-mono-num">
                  −{eur(monthlyIncome * (1 - keep / 100))}
                </span>{" "}
                par mois
              </p>
            </>
          )}

          {kind === "depense" && (
            <label className={field}>
              Montant
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  className={input}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                />
                <span className="text-ink-muted text-[13px]">€</span>
              </div>
            </label>
          )}

          {kind === "charges" && (
            <label className={field}>
              Charge mensuelle supplémentaire
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  className={input}
                  value={monthly}
                  onChange={(e) => setMonthly(Number(e.target.value))}
                />
                <span className="text-ink-muted text-[13px]">€</span>
              </div>
            </label>
          )}

          {kind === "krach" && (
            <label className={field}>
              Baisse du capital · <span className="font-mono-num">{drop}</span> %
              <input
                type="range"
                min={5}
                max={60}
                step={5}
                value={drop}
                onChange={(e) => setDrop(Number(e.target.value))}
              />
            </label>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            onAdd(build());
            onClose();
          }}
          className="w-full mt-6 bg-emerald text-paper rounded-lg py-3 text-[13px] font-semibold"
        >
          Ajouter
        </button>
      </div>
    </div>
  );
}
