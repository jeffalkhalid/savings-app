"use client";

import type { SimulationParams } from "@/lib/types";
import { formatEuro, formatPercent } from "@/lib/format";

interface Props {
  params: SimulationParams;
  setParams: (p: SimulationParams) => void;
}

type ParamKey = keyof SimulationParams;

interface FieldRow {
  key: ParamKey;
  label: string;
  min: number;
  max: number;
  step: number;
  isPercent?: boolean;
}

const VERSEMENT_FIELDS: FieldRow[] = [
  { key: "interessement", label: "Intéressement", min: 0, max: 5000, step: 100 },
  { key: "participation", label: "Participation", min: 0, max: 5000, step: 100 },
  { key: "volontaire", label: "Volontaire", min: 0, max: 5000, step: 100 },
];

const MARKET_FIELDS: FieldRow[] = [
  { key: "rate", label: "Rendement annuel", min: 0, max: 0.12, step: 0.005, isPercent: true },
  { key: "years", label: "Horizon (années)", min: 5, max: 40, step: 1 },
];

const PLAFOND_FIELDS: FieldRow[] = [
  { key: "plafondPEG", label: "Plafond abondement PEG (brut)", min: 0, max: 5000, step: 100 },
  { key: "plafondPER", label: "Plafond abondement PER (brut)", min: 0, max: 5000, step: 100 },
];

const FISCAL_FIELDS: FieldRow[] = [
  { key: "csgPlusValue", label: "CSG plus-values", min: 0, max: 0.3, step: 0.001, isPercent: true },
  { key: "csgAbondement", label: "CSG abondement (entrée)", min: 0, max: 0.3, step: 0.001, isPercent: true },
  { key: "tmi", label: "TMI sortie PER", min: 0, max: 0.5, step: 0.01, isPercent: true },
  { key: "pfuPER", label: "PFU sortie PER", min: 0, max: 0.4, step: 0.005, isPercent: true },
  { key: "csgPEA", label: "CSG sortie PEA", min: 0, max: 0.3, step: 0.001, isPercent: true },
];

function SliderField({ field, value, onChange }: { field: FieldRow; value: number; onChange: (v: number) => void }) {
  const displayValue = field.isPercent
    ? formatPercent(value)
    : field.key === "years"
      ? `${value} ans`
      : formatEuro(value);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-xs font-medium text-ink-muted tracking-wide uppercase">{field.label}</label>
        <span className="font-mono-num text-sm text-ink font-medium">{displayValue}</span>
      </div>
      <input
        type="range"
        min={field.min}
        max={field.max}
        step={field.step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

function NumberField({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-ink-muted tracking-wide uppercase">{label}</label>
      <div className="relative">
        <input
          type="number"
          value={value || ""}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          placeholder="0"
          className="w-full bg-paper border border-rule px-3 py-2 font-mono-num text-sm text-ink focus:outline-none focus:border-ink transition-colors pr-8"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-muted">€</span>
      </div>
      {hint && <p className="text-[10px] text-ink-muted italic leading-snug">{hint}</p>}
    </div>
  );
}

function SmallNumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <label className="block text-[10px] font-medium text-ink-muted tracking-wider uppercase text-center">{label}</label>
      <input
        type="number"
        value={value || ""}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        placeholder="0"
        className="w-full bg-paper border border-rule px-2 py-1.5 font-mono-num text-xs text-ink text-center focus:outline-none focus:border-ink transition-colors"
      />
    </div>
  );
}

export function ParameterPanel({ params, setParams }: Props) {
  const update = (key: ParamKey, value: number) => {
    setParams({ ...params, [key]: value });
  };

  const totalUnlocks =
    params.initialPegUnlock0 +
    params.initialPegUnlock1 +
    params.initialPegUnlock2 +
    params.initialPegUnlock3 +
    params.initialPegUnlock4;

  return (
    <aside className="bg-paper border border-rule p-6 lg:p-8 space-y-8">
      <div>
        <h2 className="font-display text-2xl text-ink mb-1">Paramètres</h2>
        <p className="text-xs text-ink-muted">Modifie les hypothèses, tout se recalcule en direct.</p>
      </div>

      <Section title="Versements annuels">
        {VERSEMENT_FIELDS.map((f) => (
          <SliderField key={f.key} field={f} value={params[f.key] as number} onChange={(v) => update(f.key, v)} />
        ))}
        <div className="pt-2 mt-2 border-t border-rule flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-wide text-ink-muted">Total annuel</span>
          <span className="font-mono-num text-sm font-medium">
            {formatEuro(params.interessement + params.participation + params.volontaire)}
          </span>
        </div>
      </Section>

      <Section title="Marché">
        {MARKET_FIELDS.map((f) => (
          <SliderField key={f.key} field={f} value={params[f.key] as number} onChange={(v) => update(f.key, v)} />
        ))}
      </Section>

      <Section title="Capital initial">
        <p className="text-xs text-ink-muted italic">Saisir le capital déjà placé. Mettre 0 pour partir de zéro.</p>
        <NumberField
          label="PEG actuel"
          value={params.initialPEG}
          onChange={(v) => {
            const sync_basis = params.initialPegBasis === params.initialPEG || params.initialPegBasis === 0;
            setParams({ ...params, initialPEG: v, ...(sync_basis ? { initialPegBasis: v } : {}) });
          }}
          hint="Valeur actuelle du PEG/PEE"
        />
        <NumberField
          label="Basis PEG"
          value={params.initialPegBasis}
          onChange={(v) => update("initialPegBasis", v)}
          hint="Base fiscale (versements nets cumulés). Par défaut = valeur. Diminue-la pour modéliser une PV latente déjà acquise."
        />
        <NumberField
          label="PER actuel"
          value={params.initialPER}
          onChange={(v) => {
            const sync_basis = params.initialPerBasis === params.initialPER || params.initialPerBasis === 0;
            setParams({ ...params, initialPER: v, ...(sync_basis ? { initialPerBasis: v } : {}) });
          }}
        />
        <NumberField label="Basis PER" value={params.initialPerBasis} onChange={(v) => update("initialPerBasis", v)} />
        <NumberField
          label="Volontaire cumulé déjà versé sur PER"
          value={params.initialVolPER}
          onChange={(v) => update("initialVolPER", v)}
          hint="Sera imposé à l'IR à la sortie (TMI)."
        />
      </Section>

      <Section title="Calendrier de déblocage PEG">
        <p className="text-xs text-ink-muted italic leading-snug">
          Montant qui devient débloqué (et donc recyclable) à chaque année. An 0 = déjà débloqué aujourd&apos;hui.
        </p>
        <div className="grid grid-cols-5 gap-1.5">
          {[0, 1, 2, 3, 4].map((yr) => {
            const key = `initialPegUnlock${yr}` as ParamKey;
            return <SmallNumberField key={yr} label={`An ${yr}`} value={params[key] as number} onChange={(v) => update(key, v)} />;
          })}
        </div>
        <div className="pt-2 mt-1 border-t border-rule flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-wide text-ink-muted">Total déblocage</span>
          <span className="font-mono-num text-sm font-medium">{formatEuro(totalUnlocks)}</span>
        </div>
      </Section>

      <Section title="Plafonds annuels">
        {PLAFOND_FIELDS.map((f) => (
          <SliderField key={f.key} field={f} value={params[f.key] as number} onChange={(v) => update(f.key, v)} />
        ))}
      </Section>

      <Section title="Fiscalité">
        {FISCAL_FIELDS.map((f) => (
          <SliderField key={f.key} field={f} value={params[f.key] as number} onChange={(v) => update(f.key, v)} />
        ))}
      </Section>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="font-display text-sm tracking-wide text-ink uppercase border-b border-rule pb-2">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
