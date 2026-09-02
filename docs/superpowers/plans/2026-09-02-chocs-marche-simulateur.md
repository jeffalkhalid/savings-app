# Chocs de marché sur le simulateur — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser un krach daté ou une période de rendement dégradé sur le simulateur d'épargne salariale, et lire sur le classement laquelle des six stratégies résiste — et si l'ordre change.

**Architecture :** un module pur transforme un rendement constant et une liste de chocs en un facteur de croissance par année ; le simulateur consomme ces facteurs, et la croissance d'une cohorte recyclée devient le produit des facteurs de ses cinq années au lieu d'une puissance ; le classement porte la comparaison.

**Tech Stack :** Next.js 15 (App Router), React 19, TypeScript, Tailwind 3, Vitest 4.

**Spec :** `docs/superpowers/specs/2026-09-02-chocs-marche-simulateur-design.md`

## Global Constraints

- Le français est la langue de toute l'UI et des messages affichés, accord du pluriel compris.
- Icônes : **lucide-react** uniquement, jamais d'emoji.
- Montants et valeurs numériques en `.font-mono-num`. Cet écran a sa propre palette (`bg-paper`, `border-rule`, `text-ink`, `text-ink-muted`, `bg-emerald`, `text-accent`) : suivre ce que les composants voisins utilisent déjà, ne pas introduire de couleur nouvelle.
- Les modules `lib/` restent purs : aucun import React, aucun accès réseau.
- Aucune migration SQL, aucune persistance du scénario.
- Commits en anglais, format `type(scope): message`, avec la ligne `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Tests : `npm run test` (Vitest 4). Vérification finale : `npx tsc --noEmit` puis `npm run build`.
- **Ne jamais lancer vitest avec `--update` ou `-u`.** Les trois snapshots de `lib/simulator.test.ts` sont la garantie que le chemin sans choc n'a pas bougé : s'ils changent, c'est une régression, jamais une mise à jour.
- **Sans choc, le résultat doit être bit à bit identique à aujourd'hui.** La garantie est structurelle — le même scalaire `growth5y` est réutilisé, on ne recalcule pas un produit — et non seulement testée : les snapshots arrondissent au centime et ne verraient pas un écart de derniers bits.
- **Une seule boucle.** Le chemin choqué et le chemin normal partagent le code ; la seule différence est une fonction qui rend soit le scalaire, soit le produit.

---

### Task 1: Module `market-shock.ts`

**Files:**
- Create: `lib/market-shock.ts`
- Test: `lib/market-shock.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `type MarketShock = { kind: "krach"; atYear: number; dropPct: number } | { kind: "rendement"; startYear: number; years: number; rate: number }`
  - `function yearFactors(input: { rate: number; years: number; shocks: MarketShock[] }): number[]`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `lib/market-shock.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { yearFactors } from "./market-shock";
import type { MarketShock } from "./market-shock";

const f = (shocks: MarketShock[], rate = 0.06, years = 10) =>
  yearFactors({ rate, years, shocks });

describe("yearFactors", () => {
  it("rend un facteur par année", () => {
    expect(f([])).toHaveLength(10);
  });

  it("sans choc, tous les facteurs sont exactement 1 + rate", () => {
    // Strictement égaux, pas seulement proches : c'est ce qui garantit que le
    // chemin sans choc reproduit les chiffres d'aujourd'hui au bit près.
    const out = f([]);
    for (const x of out) expect(x).toBe(1.06);
  });

  it("un krach multiplie la seule année visée", () => {
    const out = f([{ kind: "krach", atYear: 3, dropPct: 0.3 }]);
    expect(out[2]).toBe(1.06);
    expect(out[3]).toBeCloseTo(1.06 * 0.7, 12);
    expect(out[4]).toBe(1.06);
  });

  it("une fenêtre de rendement remplace le taux sur ses bornes exactes", () => {
    // Fenêtre [2, 5) : les années 2, 3 et 4 sont dégradées, la 1 et la 5 non.
    const out = f([{ kind: "rendement", startYear: 2, years: 3, rate: 0 }]);
    expect(out[1]).toBe(1.06);
    expect(out[2]).toBe(1);
    expect(out[4]).toBe(1);
    expect(out[5]).toBe(1.06);
  });

  it("remplace et n'additionne pas : deux années à 0 % valent 0 %", () => {
    const out = f([{ kind: "rendement", startYear: 0, years: 2, rate: 0 }]);
    expect(out[0]).toBe(1);
    expect(out[1]).toBe(1);
  });

  it("un krach posé dans une fenêtre dégradée se combine avec elle", () => {
    const out = f([
      { kind: "rendement", startYear: 2, years: 4, rate: 0.01 },
      { kind: "krach", atYear: 3, dropPct: 0.2 },
    ]);
    expect(out[2]).toBeCloseTo(1.01, 12);
    expect(out[3]).toBeCloseTo(1.01 * 0.8, 12);
  });

  it("deux krachs la même année se multiplient", () => {
    const out = f([
      { kind: "krach", atYear: 4, dropPct: 0.3 },
      { kind: "krach", atYear: 4, dropPct: 0.5 },
    ]);
    expect(out[4]).toBeCloseTo(1.06 * 0.7 * 0.5, 12);
  });

  it("ignore un choc daté hors de l'horizon", () => {
    const out = f([{ kind: "krach", atYear: 40, dropPct: 0.9 }]);
    for (const x of out) expect(x).toBe(1.06);
  });

  it("tronque une fenêtre qui déborde de l'horizon", () => {
    const out = f([{ kind: "rendement", startYear: 8, years: 10, rate: 0 }]);
    expect(out).toHaveLength(10);
    expect(out[8]).toBe(1);
    expect(out[9]).toBe(1);
  });

  it("rend une liste vide pour un horizon nul", () => {
    expect(f([], 0.06, 0)).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/market-shock.test.ts`
Expected: FAIL — « Failed to resolve import "./market-shock" ».

- [ ] **Step 3: Écrire le module**

Créer `lib/market-shock.ts` :

```ts
/**
 * Chocs de marché datés, traduits en un facteur de croissance par année.
 *
 * Deux natures volontairement différentes : un **rendement** est un régime, il
 * REMPLACE le taux de base sur sa fenêtre ; un **krach** est un événement, il
 * MULTIPLIE le facteur de son année. C'est ce qui permet de poser un krach à
 * l'intérieur d'une période déjà dégradée sans que l'un annule l'autre.
 */
export type MarketShock =
  /** Les encours perdent `dropPct` à la fin de l'année `atYear`. */
  | { kind: "krach"; atYear: number; dropPct: number }
  /** Le rendement vaut `rate` pendant `years` ans à partir de `startYear`. */
  | { kind: "rendement"; startYear: number; years: number; rate: number };

export function yearFactors(input: {
  rate: number;
  years: number;
  shocks: MarketShock[];
}): number[] {
  const { rate, years, shocks } = input;
  const n = Math.max(0, Math.round(years));

  // `1 + rate` calculé UNE fois et réutilisé tel quel : sans choc, chaque
  // facteur est le même float, et le simulateur retrouve exactement ses
  // chiffres d'aujourd'hui.
  const base = 1 + rate;
  const out: number[] = new Array(n).fill(base);

  for (const s of shocks) {
    if (s.kind === "rendement") {
      const end = Math.min(n, s.startYear + s.years);
      for (let t = Math.max(0, s.startYear); t < end; t++) {
        out[t] = 1 + s.rate;
      }
    }
  }
  // Les krachs sont appliqués APRÈS les fenêtres de rendement : sinon une
  // fenêtre posée ensuite écraserait le krach qu'elle recouvre.
  for (const s of shocks) {
    if (s.kind === "krach" && s.atYear >= 0 && s.atYear < n) {
      out[s.atYear] *= 1 - s.dropPct;
    }
  }
  return out;
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run lib/market-shock.test.ts`
Expected: PASS (10 tests).

Run: `npm run test` puis `npx tsc --noEmit`
Expected: PASS. **Les trois snapshots de `lib/simulator.test.ts` doivent être intacts** — ce module n'est encore consommé par personne.

- [ ] **Step 5: Commit**

```bash
git add lib/market-shock.ts lib/market-shock.test.ts
git commit -m "feat(simulator): dated market shocks as per-year growth factors

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Le simulateur consomme les facteurs

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/simulator.ts`
- Test: `lib/simulator.test.ts`

**Interfaces:**
- Consumes: `yearFactors`, `MarketShock` (Task 1).
- Produces: `SimulationParams` gagne `shocks?: MarketShock[]`.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à la fin de `lib/simulator.test.ts` :

```ts
describe("simulateAll sous choc", () => {
  const withShocks = (shocks: SimulationParams["shocks"]) => ({
    ...DEFAULT_PARAMS,
    shocks,
  });

  it("une liste de chocs vide ne change rien", () => {
    // La garantie du chantier : sans choc, le résultat est celui d'avant.
    expect(summaries(withShocks([]))).toEqual(summaries(DEFAULT_PARAMS));
  });

  it("un krach réduit le net de chaque stratégie", () => {
    const base = summaries(DEFAULT_PARAMS);
    const shocked = summaries(
      withShocks([{ kind: "krach", atYear: 3, dropPct: 0.3 }])
    );
    for (let i = 0; i < base.length; i++) {
      expect(shocked[i].strategy).toBe(base[i].strategy);
      expect(shocked[i].net_total).toBeLessThan(base[i].net_total);
    }
  });

  it("la date du krach change son coût", () => {
    // Un krach tardif frappe un encours plus gros, mais laisse moins d'années
    // pour se refaire : les deux écarts n'ont aucune raison d'être égaux.
    const early = summaries(
      withShocks([{ kind: "krach", atYear: 0, dropPct: 0.3 }])
    );
    const late = summaries(
      withShocks([{ kind: "krach", atYear: 9, dropPct: 0.3 }])
    );
    expect(early[0].net_total).not.toBeCloseTo(late[0].net_total, 2);
  });

  it("une période de rendement nul réduit le net", () => {
    const base = summaries(DEFAULT_PARAMS);
    const flat = summaries(
      withShocks([{ kind: "rendement", startYear: 2, years: 4, rate: 0 }])
    );
    for (let i = 0; i < base.length; i++) {
      expect(flat[i].net_total).toBeLessThan(base[i].net_total);
    }
  });

  it("un krach entre le dépôt d'une cohorte et son recyclage réduit ce qui est recyclé", () => {
    // LE test du chantier. La cohorte déposée en année 0 est recyclée en année
    // 5 : elle a traversé le krach de l'année 3. Si `growth5y` était resté un
    // scalaire, le montant mûr serait inchangé et ce test échouerait.
    // La cohorte elle-même (année 0) est antérieure au krach, donc identique :
    // le rapport attendu est exactement 1 − 0,3.
    const base = simulate("A", DEFAULT_PARAMS);
    const shocked = simulate(
      "A",
      withShocks([{ kind: "krach", atYear: 3, dropPct: 0.3 }])
    );
    expect(shocked.annual[0].D_total).toBeCloseTo(base.annual[0].D_total, 6);
    expect(base.annual[5].mature).toBeGreaterThan(0);
    expect(shocked.annual[5].mature).toBeCloseTo(
      base.annual[5].mature * 0.7,
      6
    );
  });
});
```

et compléter l'import en tête du fichier :

```ts
import { simulate, simulateAll } from "./simulator";
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/simulator.test.ts`
Expected: FAIL — `shocks` n'existe pas sur `SimulationParams`.

- [ ] **Step 3: Ajouter le champ au type**

Dans `lib/types.ts`, dans `SimulationParams`, après le bloc `// Marché` :

```ts
  /** Chocs de marché datés. Absent ou vide = scénario central. */
  shocks?: MarketShock[];
```

et l'import en tête du fichier :

```ts
import type { MarketShock } from "./market-shock";
```

- [ ] **Step 4: Brancher le simulateur**

Dans `lib/simulator.ts` :

Ajouter l'import :

```ts
import { yearFactors } from "./market-shock";
```

Après la ligne `const gainFrac5y = 1 - 1 / growth5y;`, ajouter :

```ts
  const shocks = p.shocks ?? [];
  const factors = yearFactors({ rate, years, shocks });
  const shocked = shocks.length > 0;

  /**
   * Croissance d'une cohorte déposée en `t - 5` et recyclée en `t`.
   *
   * Sans choc on rend le scalaire tel quel — surtout pas le produit de cinq
   * facteurs identiques, qui différerait des derniers bits et ferait bouger des
   * chiffres qu'aucun choc n'a touchés.
   */
  const growth5yAt = (t: number): number => {
    if (!shocked) return growth5y;
    let g = 1;
    for (let k = Math.max(0, t - 5); k < t; k++) g *= factors[k];
    return g;
  };
```

Puis, dans la boucle, introduire les deux quantités de l'année **avant** le calcul de `mature`,
c'est-à-dire juste après la ligne `const vol_t = using ? 0 : V;` — pour que `growth5yAt(t)` ne soit
appelé qu'une fois par année :

```ts
    // Croissance et part de plus-value de la cohorte recyclée cette année.
    const g5 = growth5yAt(t);
    const gainFrac = 1 - 1 / g5;
```

puis remplacer les cinq usages :

```ts
      matureFromOurs = D[t - 5] * g5;
```

dans le bloc `if (mature > 0)` :

```ts
        const targetW = M_cap_gross / 0.2 / (1 - gainFrac * csgPV);
```

```ts
      N = W * gainFrac * csgPV;
```

et plus bas :

```ts
      const basisWithdrawn = W / g5;
```

Enfin, les trois capitalisations :

```ts
    P_peg = P_peg * factors[t] + K_peg_t + M_net - N;
    P_per = P_per * factors[t] + K_per_t;
```

```ts
    peaBonus = peaBonus * factors[t] + tmi * vol_t;
```

`growth5y` et `gainFrac5y` restent déclarés : le premier est la valeur que `growth5yAt` rend sans
choc. Si `gainFrac5y` n'a plus aucun usage après ces remplacements, le supprimer — une variable
inutilisée fait échouer le lint du build.

- [ ] **Step 5: Lancer les tests**

Run: `npx vitest run lib/simulator.test.ts`
Expected: PASS. **Les trois snapshots doivent passer sans être régénérés** : c'est la vérification
que le chemin sans choc n'a pas bougé. S'ils échouent, ne pas les mettre à jour — chercher ce qui a
changé dans le chemin sans choc et le signaler.

Run: `npm run test` puis `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/simulator.ts lib/simulator.test.ts
git commit -m "feat(simulator): per-cohort growth under dated shocks

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Le scénario et la comparaison au classement

**Files:**
- Create: `components/MarketScenarioPanel.tsx`
- Modify: `components/StrategyRanking.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `MarketShock` (Task 1) ; `SimulationResult` (`lib/types.ts`) ; `formatEuro` (`lib/format.ts`).
- Produces: rien.

- [ ] **Step 1: Le panneau de scénario**

Créer `components/MarketScenarioPanel.tsx` :

```tsx
"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { MarketShock } from "@/lib/market-shock";

function describe(s: MarketShock): string {
  if (s.kind === "krach")
    return `Krach de ${Math.round(s.dropPct * 100)} % en année ${s.atYear}`;
  return `Rendement ${Math.round(s.rate * 1000) / 10} % pendant ${
    s.years
  } an${s.years > 1 ? "s" : ""} dès l'année ${s.startYear}`;
}

export function MarketScenarioPanel({
  shocks,
  years,
  onChange,
}: {
  shocks: MarketShock[];
  years: number;
  onChange: (next: MarketShock[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<MarketShock["kind"]>("krach");
  const [at, setAt] = useState(3);
  const [drop, setDrop] = useState(30);
  const [span, setSpan] = useState(3);
  const [degraded, setDegraded] = useState(0);

  const maxYear = Math.max(0, years - 1);
  const add = () => {
    const s: MarketShock =
      kind === "krach"
        ? { kind, atYear: Math.min(at, maxYear), dropPct: drop / 100 }
        : {
            kind: "rendement",
            startYear: Math.min(at, maxYear),
            years: span,
            rate: degraded / 100,
          };
    onChange([...shocks, s]);
    setOpen(false);
  };

  const label = "block text-xs text-ink-muted mb-1";
  const input =
    "w-full bg-paper border border-rule px-2 py-1.5 text-sm text-ink font-mono-num outline-none";

  return (
    <section className="px-6 lg:px-8 py-6 border-t border-rule">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-[10px] uppercase tracking-[0.16em] text-ink-muted">
          Scénario
        </h3>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-xs text-ink-muted"
        >
          <Plus size={13} />
          Ajouter un choc
        </button>
      </div>

      {!shocks.length && !open && (
        <p className="text-xs text-ink-muted">
          Aucun choc : le classement est celui du scénario central.
        </p>
      )}

      {shocks.map((s, i) => (
        <div
          key={i}
          className="flex items-center gap-2 py-2 border-b border-rule"
        >
          <span className="text-xs text-ink flex-1">{describe(s)}</span>
          <button
            type="button"
            aria-label="Retirer ce choc"
            onClick={() => onChange(shocks.filter((_, j) => j !== i))}
            className="text-ink-muted p-1"
          >
            <X size={13} />
          </button>
        </div>
      ))}

      {open && (
        <div className="mt-3 grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setKind("krach")}
              className={`py-2 text-xs border ${
                kind === "krach"
                  ? "border-ink bg-ink/[0.03] text-ink"
                  : "border-rule text-ink-muted"
              }`}
            >
              Krach
            </button>
            <button
              type="button"
              onClick={() => setKind("rendement")}
              className={`py-2 text-xs border ${
                kind === "rendement"
                  ? "border-ink bg-ink/[0.03] text-ink"
                  : "border-rule text-ink-muted"
              }`}
            >
              Rendement dégradé
            </button>
          </div>

          <div>
            <span className={label}>
              {kind === "krach" ? "Année du krach" : "Première année"}
            </span>
            <input
              type="number"
              min={0}
              max={maxYear}
              value={at}
              onChange={(e) => setAt(Number(e.target.value))}
              className={input}
            />
          </div>

          {kind === "krach" ? (
            <div>
              <span className={label}>Baisse des encours (%)</span>
              <input
                type="number"
                min={1}
                max={90}
                value={drop}
                onChange={(e) => setDrop(Number(e.target.value))}
                className={input}
              />
            </div>
          ) : (
            <>
              <div>
                <span className={label}>Durée (années)</span>
                <input
                  type="number"
                  min={1}
                  max={years}
                  value={span}
                  onChange={(e) => setSpan(Number(e.target.value))}
                  className={input}
                />
              </div>
              <div>
                <span className={label}>Rendement sur la période (%)</span>
                <input
                  type="number"
                  min={-20}
                  max={12}
                  step={0.5}
                  value={degraded}
                  onChange={(e) => setDegraded(Number(e.target.value))}
                  className={input}
                />
              </div>
            </>
          )}

          <button
            type="button"
            onClick={add}
            className="bg-emerald text-paper py-2 text-xs font-medium"
          >
            Ajouter
          </button>
        </div>
      )}

      {shocks.length > 0 && (
        <p className="text-[11px] text-ink-muted mt-3">
          Scénario non enregistré : il disparaît en rechargeant la page.
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 2: La comparaison au classement**

Dans `components/StrategyRanking.tsx`, ajouter une prop optionnelle et l'afficher.

Remplacer l'interface :

```ts
interface Props {
  results: SimulationResult[];
  shocked?: SimulationResult[] | null;
  selected: StrategyKey;
  onSelect: (k: StrategyKey) => void;
}

export function StrategyRanking({ results, shocked, selected, onSelect }: Props) {
```

Après la ligne `const spread = …`, ajouter :

```ts
  // Le classement affiché reste celui de référence : c'est le déplacement PAR
  // RAPPORT à lui que le lecteur cherche, pas un second classement à comparer
  // de tête.
  const shockedByKey = new Map(
    (shocked ?? []).map((r) => [r.strategy, r] as const)
  );
  const shockedRank = new Map(
    [...(shocked ?? [])]
      .sort((a, b) => b.summary.net_total - a.summary.net_total)
      .map((r, i) => [r.strategy, i] as const)
  );
```

Puis, dans la carte, **après** le bloc du multiplicateur (`<div className="flex items-baseline justify-between mt-2 …">…</div>`), insérer :

```tsx
              {shockedByKey.has(r.strategy) && (
                <div className="mt-3 pt-3 border-t border-rule">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-ink-muted">Avec chocs</span>
                    <span className="font-mono-num text-ink">
                      {formatEuro(
                        shockedByKey.get(r.strategy)!.summary.net_total
                      )}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-xs mt-1">
                    <span className="text-ink-muted">Écart</span>
                    <span className="font-mono-num text-accent">
                      {formatEuro(
                        shockedByKey.get(r.strategy)!.summary.net_total -
                          r.summary.net_total
                      )}
                    </span>
                  </div>
                  {shockedRank.get(r.strategy) !== idx && (
                    <div className="text-[11px] text-ink mt-1.5">
                      Passe {idx + 1}ᵉ → {(shockedRank.get(r.strategy) ?? 0) + 1}ᵉ
                    </div>
                  )}
                </div>
              )}
```

Ne rien changer d'autre : ni le tri de référence, ni le marqueur « Meilleur », qui reste celui du
scénario central.

- [ ] **Step 3: Brancher la page**

Dans `app/page.tsx` :

```ts
import { MarketScenarioPanel } from "@/components/MarketScenarioPanel";
import type { MarketShock } from "@/lib/market-shock";
```

Ajouter l'état, à côté de `selected` :

```ts
  const [shocks, setShocks] = useState<MarketShock[]>([]);
```

Remplacer le `useMemo` des résultats par deux :

```ts
  // La référence est calculée SANS chocs, explicitement : elle ne doit pas
  // dépendre de ce que `params` pourrait porter.
  const results = useMemo(
    () => simulateAll({ ...params, shocks: [] }),
    [params]
  );
  const shockedResults = useMemo(
    () => (shocks.length ? simulateAll({ ...params, shocks }) : null),
    [params, shocks]
  );
```

Dans la barre latérale, sous `<ParameterPanel … />` :

```tsx
          <MarketScenarioPanel
            shocks={shocks}
            years={params.years}
            onChange={setShocks}
          />
```

Et passer la comparaison au classement :

```tsx
          <StrategyRanking
            results={results}
            shocked={shockedResults}
            selected={selected}
            onSelect={setSelected}
          />
```

`ComparisonChart`, `StrategyDetail` et `DataTables` continuent de recevoir `results` : ils montrent
le scénario central, comme la spec le prévoit.

- [ ] **Step 4: Vérifier**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

Run: `npm run test`
Expected: PASS, **les trois snapshots de `lib/simulator.test.ts` intacts**.

Run: `npm run build`
Expected: build réussi.

- [ ] **Step 5: Commit**

```bash
git add components/MarketScenarioPanel.tsx components/StrategyRanking.tsx app/page.tsx
git commit -m "feat(simulator): market scenario panel and ranking comparison

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Smoke test manuel (à faire par l'utilisateur)**

1. `npm run dev`, ouvrir la racine. Sans choc : l'écran et les chiffres sont exactement ceux
   d'avant, et la section « Scénario » annonce le scénario central.
2. Ajouter « krach 30 % en année 3 » : chaque carte gagne son montant choqué et son écart, tous
   négatifs.
3. Vérifier si une carte affiche un changement de rang — et si aucune ne le fait, c'est une réponse :
   le classement résiste à ce choc.
4. Ajouter « rendement 0 % pendant 4 ans dès l'année 2 » par-dessus : les deux se cumulent.
5. Retirer les chocs un par un : à zéro choc, l'écran redevient celui du départ.

---

## Notes d'exécution

- **Ordre contraignant** : Task 1, puis Task 2, puis Task 3.
- **Les trois snapshots de `lib/simulator.test.ts` ne doivent jamais être régénérés.** Ils sont la
  preuve que le chemin sans choc est intact. `--update` est interdit.
- Aucune migration SQL, aucune persistance.
- `lib/market-shock.ts` et `lib/simulator.ts` restent purs : aucun import React.
- Le vrai risque de ce chantier est dans la Task 2, pas dans l'UI : c'est l'arithmétique du recyclage
  qui change. Le test « un krach entre le dépôt et le recyclage » est celui qui prouve le travail.
