# Chocs fiscaux et d'abondement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser un changement de fiscalité daté ou un abondement réduit sur le simulateur, et lire sur le classement laquelle des six stratégies encaisse le mieux un changement de règle.

**Architecture :** un module pur transforme les taux de base et une liste de chocs de politique en un jeu de taux par année et un facteur d'abondement par année ; le simulateur les consomme là où il figeait des scalaires hors de sa boucle ; le panneau de scénario existant accueille les deux nouveaux types.

**Tech Stack :** Next.js 15 (App Router), React 19, TypeScript, Tailwind 3, Vitest 4.

**Spec :** `docs/superpowers/specs/2026-09-02-chocs-fiscaux-simulateur-design.md`

## Global Constraints

- Le français est la langue de toute l'UI et des messages affichés, accord du pluriel compris.
- Icônes : **lucide-react** uniquement, jamais d'emoji.
- Montants et valeurs numériques en `.font-mono-num`. Cet écran a sa propre palette (`bg-paper`, `border-rule`, `text-ink`, `text-ink-muted`, `bg-emerald`, `text-accent`) : suivre les composants voisins, n'introduire aucune couleur nouvelle.
- Les modules `lib/` restent purs : aucun import React, aucun accès réseau.
- Aucune migration SQL, aucune persistance du scénario, aucune nouvelle dépendance.
- Commits en anglais, format `type(scope): message`, avec la ligne `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Tests : `npm run test` (Vitest 4). Vérification finale : `npx tsc --noEmit` puis `npm run build`.
- **Ne jamais lancer vitest avec `--update` ou `-u`.** Les trois snapshots de `lib/simulator.test.ts` sont la garantie que le chemin sans choc n'a pas bougé : s'ils changent, c'est une régression à diagnostiquer, jamais à régénérer.
- **Sans choc de politique, le résultat doit être bit à bit identique.** La garantie est structurelle, pas seulement testée.
- **Les chocs de marché ne sont pas touchés** : ils vivent dans `lib/market-shock.ts` et leur consommation dans `simulate` reste telle quelle. Les deux familles se cumulent sans se connaître.

---

### Task 1: Module `fiscal-shock.ts`

**Files:**
- Create: `lib/fiscal-shock.ts`
- Test: `lib/fiscal-shock.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `type FiscalRates = { csgPlusValue: number; csgAbondement: number; tmi: number; pfuPER: number; csgPEA: number }`
  - `type PolicyShock = { kind: "fiscalite"; fromYear: number; rates: Partial<FiscalRates> } | { kind: "abondement"; fromYear: number; factor: number }`
  - `function ratesByYear(base: FiscalRates, years: number, shocks: PolicyShock[]): FiscalRates[]`
  - `function abondementFactors(years: number, shocks: PolicyShock[]): number[]`
  - `function exitRates(rates: FiscalRates[], base: FiscalRates): FiscalRates`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `lib/fiscal-shock.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { ratesByYear, abondementFactors, exitRates } from "./fiscal-shock";
import type { FiscalRates, PolicyShock } from "./fiscal-shock";

const BASE: FiscalRates = {
  csgPlusValue: 0.186,
  csgAbondement: 0.097,
  tmi: 0.3,
  pfuPER: 0.3,
  csgPEA: 0.172,
};

const r = (shocks: PolicyShock[], years = 10) =>
  ratesByYear(BASE, years, shocks);
const a = (shocks: PolicyShock[], years = 10) =>
  abondementFactors(years, shocks);

describe("ratesByYear", () => {
  it("rend un jeu de taux par année", () => {
    expect(r([])).toHaveLength(10);
  });

  it("sans choc, chaque année porte exactement les taux de base", () => {
    // Égalité stricte : c'est ce qui garantit que le simulateur retrouve ses
    // chiffres d'aujourd'hui au bit près.
    for (const y of r([])) {
      expect(y.csgPlusValue).toBe(0.186);
      expect(y.csgAbondement).toBe(0.097);
      expect(y.tmi).toBe(0.3);
      expect(y.pfuPER).toBe(0.3);
      expect(y.csgPEA).toBe(0.172);
    }
  });

  it("ne remplace que les taux nommés, à partir de l'année dite", () => {
    const out = r([
      { kind: "fiscalite", fromYear: 5, rates: { pfuPER: 0.35 } },
    ]);
    expect(out[4].pfuPER).toBe(0.3);
    expect(out[5].pfuPER).toBe(0.35);
    expect(out[9].pfuPER).toBe(0.35);
    // Tout le reste est intact, y compris après le choc.
    expect(out[9].csgPlusValue).toBe(0.186);
    expect(out[9].tmi).toBe(0.3);
  });

  it("compose deux chocs : le second n'écrase que les siens", () => {
    const out = r([
      { kind: "fiscalite", fromYear: 2, rates: { pfuPER: 0.35, tmi: 0.41 } },
      { kind: "fiscalite", fromYear: 6, rates: { tmi: 0.45 } },
    ]);
    expect(out[3].pfuPER).toBe(0.35);
    expect(out[3].tmi).toBe(0.41);
    // Le PFU du premier choc survit au second.
    expect(out[7].pfuPER).toBe(0.35);
    expect(out[7].tmi).toBe(0.45);
  });

  it("applique les chocs par année croissante quel que soit l'ordre de la liste", () => {
    // Le choc tardif est listé EN PREMIER : une boucle qui traiterait la liste
    // dans l'ordre laisserait tmi à 0,45 dès l'année 6 puis le rabaisserait.
    const out = r([
      { kind: "fiscalite", fromYear: 6, rates: { tmi: 0.45 } },
      { kind: "fiscalite", fromYear: 2, rates: { tmi: 0.41 } },
    ]);
    expect(out[3].tmi).toBe(0.41);
    expect(out[7].tmi).toBe(0.45);
  });

  it("ignore un choc daté hors de l'horizon", () => {
    const out = r([
      { kind: "fiscalite", fromYear: 40, rates: { pfuPER: 0.9 } },
    ]);
    for (const y of out) expect(y.pfuPER).toBe(0.3);
  });

  it("applique dès l'année 0 un choc daté avant l'horizon", () => {
    const out = r([
      { kind: "fiscalite", fromYear: -3, rates: { pfuPER: 0.35 } },
    ]);
    expect(out[0].pfuPER).toBe(0.35);
  });

  it("rend une liste vide pour un horizon nul", () => {
    expect(r([], 0)).toEqual([]);
  });
});

describe("abondementFactors", () => {
  it("sans choc, chaque facteur vaut exactement 1", () => {
    for (const f of a([])) expect(f).toBe(1);
  });

  it("remplace le facteur à partir de l'année dite", () => {
    const out = a([{ kind: "abondement", fromYear: 4, factor: 0.5 }]);
    expect(out[3]).toBe(1);
    expect(out[4]).toBe(0.5);
    expect(out[9]).toBe(0.5);
  });

  it("remplace et ne multiplie pas deux facteurs successifs", () => {
    // « divisé par deux » puis « supprimé » donne 0,5 puis 0 — jamais 0 dès la
    // première fenêtre, et jamais 0,25 par accumulation.
    const out = a([
      { kind: "abondement", fromYear: 4, factor: 0.5 },
      { kind: "abondement", fromYear: 8, factor: 0 },
    ]);
    expect(out[4]).toBe(0.5);
    expect(out[7]).toBe(0.5);
    expect(out[8]).toBe(0);
  });

  it("ignore les chocs fiscaux", () => {
    const out = a([
      { kind: "fiscalite", fromYear: 2, rates: { tmi: 0.45 } },
    ]);
    for (const f of out) expect(f).toBe(1);
  });

  it("ignore un choc daté hors de l'horizon", () => {
    const out = a([{ kind: "abondement", fromYear: 40, factor: 0 }]);
    for (const f of out) expect(f).toBe(1);
  });
});

describe("exitRates", () => {
  it("rend les taux de la dernière année simulée", () => {
    const rates = r([
      { kind: "fiscalite", fromYear: 5, rates: { pfuPER: 0.35 } },
    ]);
    expect(exitRates(rates, BASE).pfuPER).toBe(0.35);
  });

  it("rend les taux de base sur un horizon nul", () => {
    expect(exitRates([], BASE)).toBe(BASE);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/fiscal-shock.test.ts`
Expected: FAIL — « Failed to resolve import "./fiscal-shock" ».

- [ ] **Step 3: Écrire le module**

Créer `lib/fiscal-shock.ts` :

```ts
/**
 * Chocs de politique datés : changement de fiscalité, changement d'abondement.
 *
 * Deux familles distinctes des chocs de marché (`lib/market-shock.ts`) : un
 * choc de marché déforme la croissance, un choc de politique déforme le
 * prélèvement. Elles se cumulent sans se connaître.
 */
export type FiscalRates = {
  csgPlusValue: number;
  csgAbondement: number;
  tmi: number;
  pfuPER: number;
  csgPEA: number;
};

export type PolicyShock =
  /** À partir de `fromYear`, les taux nommés remplacent les précédents. */
  | { kind: "fiscalite"; fromYear: number; rates: Partial<FiscalRates> }
  /** À partir de `fromYear`, l'abondement calculé est multiplié par `factor`. */
  | { kind: "abondement"; fromYear: number; factor: number };

/** Année à laquelle un choc prend effet, quel que soit son type. */
const yearOf = (s: PolicyShock): number => s.fromYear;

export function ratesByYear(
  base: FiscalRates,
  years: number,
  shocks: PolicyShock[]
): FiscalRates[] {
  const n = Math.max(0, Math.round(years));
  // Sans choc, chaque année porte les valeurs de `base` telles quelles : ce
  // sont les mêmes flottants, jamais recalculés.
  const out: FiscalRates[] = new Array(n).fill(null).map(() => ({ ...base }));

  // Par année croissante : un choc tardif doit écraser un choc antérieur, quel
  // que soit l'ordre dans lequel l'utilisateur les a posés.
  const sorted = shocks
    .filter((s): s is Extract<PolicyShock, { kind: "fiscalite" }> =>
      s.kind === "fiscalite"
    )
    .sort((x, y) => yearOf(x) - yearOf(y));

  for (const s of sorted) {
    for (let t = Math.max(0, s.fromYear); t < n; t++) {
      out[t] = { ...out[t], ...s.rates };
    }
  }
  return out;
}

export function abondementFactors(
  years: number,
  shocks: PolicyShock[]
): number[] {
  const n = Math.max(0, Math.round(years));
  const out: number[] = new Array(n).fill(1);

  const sorted = shocks
    .filter((s): s is Extract<PolicyShock, { kind: "abondement" }> =>
      s.kind === "abondement"
    )
    .sort((x, y) => yearOf(x) - yearOf(y));

  // REMPLACEMENT et non multiplication : chaque facteur se lit par rapport au
  // barème d'origine, donc « divisé par deux » puis « supprimé » donne 0,5 puis
  // 0 — et non 0 dès la première fenêtre par accumulation.
  for (const s of sorted) {
    for (let t = Math.max(0, s.fromYear); t < n; t++) {
      out[t] = s.factor;
    }
  }
  return out;
}

export function exitRates(
  rates: FiscalRates[],
  base: FiscalRates
): FiscalRates {
  // La fiscalité de sortie est celle du jour où l'on sort.
  return rates.length ? rates[rates.length - 1] : base;
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run lib/fiscal-shock.test.ts`
Expected: PASS (15 tests).

Run: `npm run test` puis `npx tsc --noEmit`
Expected: PASS. **Les trois snapshots de `lib/simulator.test.ts` doivent être intacts** — ce module n'est encore consommé par personne.

- [ ] **Step 5: Commit**

```bash
git add lib/fiscal-shock.ts lib/fiscal-shock.test.ts
git commit -m "feat(simulator): dated fiscal and abondement policy shocks

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Le simulateur consomme les taux datés

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/simulator.ts`
- Test: `lib/simulator.test.ts`

**Interfaces:**
- Consumes: `ratesByYear`, `abondementFactors`, `exitRates`, `FiscalRates`, `PolicyShock` (Task 1).
- Produces: `SimulationParams` gagne `policyShocks?: PolicyShock[]`.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à la fin de `lib/simulator.test.ts` :

```ts
describe("simulateAll sous choc de politique", () => {
  const withPolicy = (policyShocks: SimulationParams["policyShocks"]) => ({
    ...DEFAULT_PARAMS,
    policyShocks,
  });

  it("une liste vide ne change rien", () => {
    expect(summaries(withPolicy([]))).toEqual(summaries(DEFAULT_PARAMS));
  });

  it("un PFU relevé frappe le PER et laisse le PEG pur intact", () => {
    // LE test d'assiette. La stratégie A n'utilise que le PEG : sa poche PER
    // reste vide, donc le PFU sur les plus-values PER ne peut pas la toucher.
    // Un choc qui frapperait tout le monde ne prouverait rien.
    const base = summaries(DEFAULT_PARAMS);
    const shocked = summaries(
      withPolicy([{ kind: "fiscalite", fromYear: 0, rates: { pfuPER: 0.45 } }])
    );
    const byKey = (xs: typeof base, k: string) =>
      xs.find((x) => x.strategy === k)!;
    expect(byKey(shocked, "A").net_total).toBeCloseTo(
      byKey(base, "A").net_total,
      6
    );
    expect(byKey(shocked, "B").net_total).toBeLessThan(
      byKey(base, "B").net_total
    );
  });

  it("un abondement supprimé ramène le versement annuel à I + P + V", () => {
    // La spec le dit : la stratégie « PER pur » est touchée elle aussi, car
    // K_PER_net capte son propre abondement. Ce qui discrimine, c'est le
    // versement lui-même.
    const p = withPolicy([{ kind: "abondement", fromYear: 0, factor: 0 }]);
    const out = simulate("A", p);
    const expected =
      DEFAULT_PARAMS.interessement +
      DEFAULT_PARAMS.participation +
      DEFAULT_PARAMS.volontaire;
    expect(out.annual[0].K_PEG).toBeCloseTo(expected, 6);
    expect(simulate("A", DEFAULT_PARAMS).annual[0].K_PEG).toBeGreaterThan(
      expected
    );
  });

  it("un abondement daté ne touche que les années suivantes", () => {
    const out = simulate(
      "A",
      withPolicy([{ kind: "abondement", fromYear: 3, factor: 0 }])
    );
    const ref = simulate("A", DEFAULT_PARAMS);
    expect(out.annual[2].K_PEG).toBeCloseTo(ref.annual[2].K_PEG, 6);
    expect(out.annual[3].K_PEG).toBeLessThan(ref.annual[3].K_PEG);
  });

  it("une TMI datée change le résultat", () => {
    // Sans l'accumulateur de base du bonus PEA, ce cas rendrait une base
    // fausse — c'est le piège documenté au §3.1 de la spec.
    const base = summaries(DEFAULT_PARAMS);
    const shocked = summaries(
      withPolicy([{ kind: "fiscalite", fromYear: 5, rates: { tmi: 0.45 } }])
    );
    const b = base.find((x) => x.strategy === "B")!;
    const s = shocked.find((x) => x.strategy === "B")!;
    expect(s.net_total).not.toBeCloseTo(b.net_total, 2);
  });

  it("un choc de marché et un choc fiscal se cumulent", () => {
    const both = summaries({
      ...DEFAULT_PARAMS,
      shocks: [{ kind: "krach" as const, atYear: 3, dropPct: 0.3 }],
      policyShocks: [
        { kind: "fiscalite" as const, fromYear: 5, rates: { pfuPER: 0.45 } },
      ],
    });
    const marketOnly = summaries({
      ...DEFAULT_PARAMS,
      shocks: [{ kind: "krach" as const, atYear: 3, dropPct: 0.3 }],
    });
    const b = marketOnly.find((x) => x.strategy === "B")!;
    const s = both.find((x) => x.strategy === "B")!;
    expect(s.net_total).toBeLessThan(b.net_total);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/simulator.test.ts`
Expected: FAIL — `policyShocks` n'existe pas sur `SimulationParams`.

- [ ] **Step 3: Ajouter le champ au type**

Dans `lib/types.ts`, à côté de `shocks?: MarketShock[]` :

```ts
  /** Chocs de politique datés : fiscalité, abondement. */
  policyShocks?: PolicyShock[];
```

et l'import :

```ts
import type { PolicyShock } from "./fiscal-shock";
```

- [ ] **Step 4: Brancher le simulateur**

Dans `lib/simulator.ts`, ajouter l'import :

```ts
import { ratesByYear, abondementFactors, exitRates } from "./fiscal-shock";
import type { FiscalRates } from "./fiscal-shock";
```

Après le bloc `const shocked = factors.some(…)`, ajouter :

```ts
  const policyShocks = p.policyShocks ?? [];
  const baseRates: FiscalRates = {
    csgPlusValue: csgPV,
    csgAbondement: csgAb,
    tmi,
    pfuPER,
    csgPEA,
  };
  const rates = ratesByYear(baseRates, years, policyShocks);
  const abondF = abondementFactors(years, policyShocks);
  const exit = exitRates(rates, baseRates);
  // La base du bonus PEA ne peut devenir une somme que si la TMI varie : sinon
  // `Σ tmi × vol_t` différerait de `tmi × Σ vol_t` des derniers bits, pour
  // rien. Voir §3.1 de la spec.
  const tmiVaries = rates.some((y) => y.tmi !== tmi);
```

**Supprimer** les deux constantes désormais calculées par année :

```ts
  const K_PEG_net = I + P + V + baseAbondPEG * (1 - csgAb);
  const K_PER_net = I + P + V + Math.min(baseAbondPER, plafondPER) * (1 - csgAb);
```

Ajouter un accumulateur à côté de `let peaBonus = 0;` :

```ts
  // Base nominale du bonus PEA, accumulée au taux de chaque année. Initialisée
  // avec les versements antérieurs à la simulation, déduits au taux de base.
  let peaBasisAcc = tmi * p.initialVolPER;
```

Dans la boucle, **avant** `const K_peg_t = …`, insérer :

```ts
    const r_t = rates[t] ?? baseRates;
    // `?? 1` pour la même raison que `rates[t] ?? baseRates` ci-dessus : les
    // deux tableaux sont dimensionnés sur `Math.round(years)` alors que la
    // boucle court jusqu'à `years`. Sur un horizon entier — le seul que
    // l'écran produise — ces garde-fous ne servent jamais.
    const abondPEG_t = baseAbondPEG * (abondF[t] ?? 1);
    const abondPER_t = baseAbondPER * (abondF[t] ?? 1);
    // Multiplier par un facteur qui vaut exactement 1 est exact en IEEE-754 :
    // sans choc d'abondement, ces deux expressions sont celles d'avant, au bit
    // près.
    const K_PEG_net_t = I + P + V + abondPEG_t * (1 - r_t.csgAbondement);
    const K_PER_net_t =
      I + P + V + Math.min(abondPER_t, plafondPER) * (1 - r_t.csgAbondement);
```

Puis remplacer, dans l'ordre où ils apparaissent :

```ts
    const K_peg_t = using ? K_PEG_net_t : 0;
    const K_per_t = using ? 0 : K_PER_net_t;
```

```ts
      const M_cap_gross = plafondPEG - (using ? abondPEG_t : 0);
```

```ts
        const targetW = M_cap_gross / 0.2 / (1 - gainFrac * r_t.csgPlusValue);
```

```ts
      N = W * gainFrac * r_t.csgPlusValue;
```

```ts
      M_net = M_gross * (1 - r_t.csgAbondement);
```

```ts
    peaBonus = peaBonus * factors[t] + r_t.tmi * vol_t;
    peaBasisAcc += r_t.tmi * vol_t;
```

Enfin, dans le bloc de fiscalité de sortie, remplacer les cinq usages :

```ts
  const peaBasisNominal = tmiVaries ? peaBasisAcc : tmi * volCumul;
  const PV_pea = Math.max(0, peaBonus - peaBasisNominal);

  const tax_PEG_exit = PV_peg * exit.csgPlusValue;
  const tax_PER_IR = exit.tmi * volCumul;
  const tax_PER_PFU = PV_per * exit.pfuPER;
  const tax_PEA_exit = PV_pea * exit.csgPEA;
```

Si `csgPV`, `csgAb`, `pfuPER` ou `csgPEA` n'ont plus d'usage après ces remplacements, **ne pas les
retirer de la déstructuration** : ils alimentent `baseRates`. En revanche, une variable réellement
inutilisée fait échouer le lint du build — vérifier avec `npx tsc --noEmit`.

- [ ] **Step 5: Lancer les tests**

Run: `npx vitest run lib/simulator.test.ts`
Expected: PASS. **Les trois snapshots doivent passer sans être régénérés.** S'ils échouent, ne pas les
mettre à jour : chercher ce qui a bougé sur le chemin sans choc et le signaler.

Run: `npm run test` puis `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/simulator.ts lib/simulator.test.ts
git commit -m "feat(simulator): per-year fiscal rates and abondement factor

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Les deux nouveaux chocs dans le panneau

**Files:**
- Modify: `components/MarketScenarioPanel.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `PolicyShock`, `FiscalRates` (Task 1) ; `MarketShock` (existant).
- Produces: rien.

Le panneau porte désormais une **liste mixte**. La page la scinde par famille avant d'appeler
`simulateAll` : c'est la seule façon de garder une seule liste à l'écran et deux champs distincts dans
les paramètres.

- [ ] **Step 1: Élargir le panneau**

Dans `components/MarketScenarioPanel.tsx` :

Remplacer les imports et introduire le type mixte :

```tsx
import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { MarketShock } from "@/lib/market-shock";
import type { FiscalRates, PolicyShock } from "@/lib/fiscal-shock";

/** Un scénario mêle chocs de marché et chocs de politique dans une seule liste. */
export type ScenarioShock = MarketShock | PolicyShock;

const RATE_LABELS: { key: keyof FiscalRates; label: string }[] = [
  { key: "csgPlusValue", label: "CSG plus-values" },
  { key: "csgAbondement", label: "CSG abondement" },
  { key: "tmi", label: "TMI" },
  { key: "pfuPER", label: "PFU PER" },
  { key: "csgPEA", label: "CSG PEA" },
];
```

Remplacer `describe` par une version couvrant les quatre types :

```tsx
function describe(s: ScenarioShock): string {
  if (s.kind === "krach")
    return `Krach de ${Math.round(s.dropPct * 100)} % en année ${s.atYear}`;
  if (s.kind === "rendement")
    return `Rendement de ${Math.round(s.rate * 1000) / 10} % pendant ${
      s.years
    } an${s.years > 1 ? "s" : ""} dès l'année ${s.startYear}`;
  if (s.kind === "abondement")
    return s.factor === 0
      ? `Abondement supprimé dès l'année ${s.fromYear}`
      : `Abondement × ${s.factor} dès l'année ${s.fromYear}`;
  // Un choc fiscal ne nomme que les taux qu'il change.
  const changed = RATE_LABELS.filter((r) => s.rates[r.key] !== undefined)
    .map((r) => `${r.label} ${Math.round((s.rates[r.key] as number) * 1000) / 10} %`)
    .join(" · ");
  return `Fiscalité dès l'année ${s.fromYear} · ${changed || "aucun taux"}`;
}
```

Remplacer `outOfHorizon` :

```tsx
/** Un choc daté au-delà de l'horizon n'est plus simulé — il ne doit pas se lire comme actif. */
export function outOfHorizon(s: ScenarioShock, years: number): boolean {
  const start =
    s.kind === "krach"
      ? s.atYear
      : s.kind === "rendement"
        ? s.startYear
        : s.fromYear;
  return start < 0 || start >= years;
}
```

Élargir la signature et l'état :

```tsx
export function MarketScenarioPanel({
  shocks,
  years,
  onChange,
}: {
  shocks: ScenarioShock[];
  years: number;
  onChange: (next: ScenarioShock[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ScenarioShock["kind"]>("krach");
  const [at, setAt] = useState(3);
  const [drop, setDrop] = useState(30);
  const [span, setSpan] = useState(3);
  const [degraded, setDegraded] = useState(0);
  const [rateKey, setRateKey] = useState<keyof FiscalRates>("pfuPER");
  const [ratePct, setRatePct] = useState(35);
  const [factor, setFactor] = useState(0.5);
```

Élargir `add()` — en conservant la règle déjà en place : l'année n'est **pas** bornée à l'horizon,
elle est signalée « hors horizon » dans la liste :

```tsx
  const add = () => {
    const year = Math.max(0, at);
    let s: ScenarioShock;
    if (kind === "krach") {
      s = { kind, atYear: year, dropPct: Math.min(90, Math.max(1, drop)) / 100 };
    } else if (kind === "rendement") {
      s = {
        kind,
        startYear: year,
        years: Math.max(1, span),
        rate: degraded / 100,
      };
    } else if (kind === "abondement") {
      s = { kind, fromYear: year, factor: Math.max(0, factor) };
    } else {
      s = {
        kind: "fiscalite",
        fromYear: year,
        rates: { [rateKey]: Math.max(0, ratePct) / 100 },
      };
    }
    onChange([...shocks, s]);
    setOpen(false);
  };
```

Dans le sélecteur de type, remplacer les deux boutons par quatre, en gardant exactement le style
existant (une grille à deux colonnes suffit, deux lignes) :

```tsx
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["krach", "Krach"],
                ["rendement", "Rendement dégradé"],
                ["fiscalite", "Fiscalité"],
                ["abondement", "Abondement"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setKind(v)}
                className={`py-2 text-xs border ${
                  kind === v
                    ? "border-ink bg-ink/[0.03] text-ink"
                    : "border-rule text-ink-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
```

Et ajouter les deux blocs de champs, après ceux qui existent :

```tsx
          {kind === "fiscalite" && (
            <>
              <div>
                <span className={label}>Taux modifié</span>
                <select
                  value={rateKey}
                  onChange={(e) =>
                    setRateKey(e.target.value as keyof FiscalRates)
                  }
                  className={input}
                >
                  {RATE_LABELS.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className={label}>Nouveau taux (%)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={ratePct}
                  onChange={(e) => setRatePct(Number(e.target.value))}
                  className={input}
                />
              </div>
            </>
          )}

          {kind === "abondement" && (
            <div>
              <span className={label}>
                Facteur — 0 supprime, 0,5 divise par deux
              </span>
              <input
                type="number"
                min={0}
                max={3}
                step={0.1}
                value={factor}
                onChange={(e) => setFactor(Number(e.target.value))}
                className={input}
              />
            </div>
          )}
```

Le libellé « À partir de » / « Quand » du champ d'année doit aussi couvrir les deux nouveaux types :
utiliser « À partir de » pour `rendement`, `fiscalite` et `abondement`, « Quand » pour `krach`.

- [ ] **Step 2: Scinder la liste dans la page**

Dans `app/page.tsx` :

```ts
import { outOfHorizon } from "@/components/MarketScenarioPanel";
import type { ScenarioShock } from "@/components/MarketScenarioPanel";
import type { MarketShock } from "@/lib/market-shock";
import type { PolicyShock } from "@/lib/fiscal-shock";
```

Remplacer l'état et les deux mémos par :

```ts
  const [shocks, setShocks] = useState<ScenarioShock[]>([]);

  const marketShocks = useMemo(
    () =>
      shocks.filter(
        (s): s is MarketShock => s.kind === "krach" || s.kind === "rendement"
      ),
    [shocks]
  );
  const policyShocks = useMemo(
    () =>
      shocks.filter(
        (s): s is PolicyShock =>
          s.kind === "fiscalite" || s.kind === "abondement"
      ),
    [shocks]
  );

  // La référence est calculée SANS aucun choc, explicitement.
  const results = useMemo(
    () => simulateAll({ ...params, shocks: [], policyShocks: [] }),
    [params]
  );

  // Un scénario dont TOUS les chocs sont hors horizon ne doit rien afficher.
  // On réutilise le prédicat du panneau plutôt que de le réécrire : deux
  // définitions de « hors horizon » finiraient par diverger, et l'écran
  // afficherait alors une colonne pour un choc barré, ou l'inverse.
  const effective = shocks.some((s) => !outOfHorizon(s, params.years));
  const shockedResults = useMemo(
    () =>
      effective
        ? simulateAll({ ...params, shocks: marketShocks, policyShocks })
        : null,
    [params, marketShocks, policyShocks, effective]
  );
```

Le reste de la page ne change pas : `MarketScenarioPanel` reçoit toujours `shocks` et `setShocks`,
`StrategyRanking` toujours `results` et `shockedResults`.

- [ ] **Step 3: Vérifier**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

Run: `npm run test`
Expected: PASS, **les trois snapshots intacts**.

Run: `npm run build`
Expected: build réussi.

- [ ] **Step 4: Commit**

```bash
git add components/MarketScenarioPanel.tsx app/page.tsx
git commit -m "feat(simulator): fiscal and abondement shocks in the scenario panel

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Smoke test manuel (à faire par l'utilisateur)**

1. `npm run dev`, ouvrir la racine. Sans choc : chiffres identiques à avant.
2. Ajouter « Fiscalité · PFU PER · 45 % dès l'année 0 » : les stratégies PER reculent, « PEG
   agressif » ne bouge pas d'un centime. C'est la preuve que le choc frappe la bonne assiette.
3. Ajouter « Abondement · facteur 0 dès l'année 0 » : toutes les stratégies reculent, y compris
   « PER pur » — elle capte son propre abondement.
4. Poser un krach et un choc fiscal ensemble : les deux se cumulent.
5. Dater un choc au-delà de l'horizon : il apparaît barré, « hors horizon ».

---

## Notes d'exécution

- **Ordre contraignant** : Task 1, puis Task 2, puis Task 3.
- **Les trois snapshots de `lib/simulator.test.ts` ne doivent jamais être régénérés.** `--update` est
  interdit sur toute la branche.
- Aucune migration, aucune persistance, aucune dépendance nouvelle.
- Les chocs de marché ne sont pas modifiés : `lib/market-shock.ts` n'est pas touché, et
  `growth5yAt` non plus.
- Le vrai risque est dans la Task 2, et précisément à deux endroits : les quantités d'abondement qui
  passent de « hors boucle » à « par année », et la base du bonus PEA qui devient une somme. Le test
  d'assiette (« un PFU relevé ne touche pas le PEG pur ») est celui qui prouve le premier ; les
  snapshots inchangés prouvent le second.
