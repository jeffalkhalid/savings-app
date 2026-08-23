# Barème d'abondement paramétrable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à chaque utilisateur de saisir son propre barème d'abondement employeur (persisté sur son compte) au lieu du barème Carrefour codé en dur, sans changer d'un centime les résultats de ceux qui n'y touchent pas.

**Architecture :** un module pur `lib/abondement.ts` décrit le barème sous forme de tranches (`{upTo, rate}`) et sait l'appliquer ; `lib/simulator.ts` perd ses deux fonctions codées en dur et consomme ce module via un nouveau champ `bareme` de `SimulationParams` ; le barème de l'utilisateur est stocké dans une colonne JSONB de `user_settings` et édité depuis une bottom-sheet de l'onglet Épargne.

**Tech Stack :** Next.js 15 (App Router), React 19, TypeScript, Tailwind 3, Supabase (Postgres + RLS), Vitest 4, lucide-react.

**Spec :** `docs/superpowers/specs/2026-08-23-boussole-abondement-parametrable-design.md`

## Global Constraints

- Le français est la langue de toute l'UI et des messages d'erreur affichés.
- Icônes : **lucide-react** uniquement, jamais d'emoji.
- Tous les montants affichés utilisent la classe `.font-mono-num` et les tokens Boussole (`text-ink`, `text-ink-muted`, `bg-card`, `bg-paper`, `border-rule`, `text-accent`, `bg-seg`, `bg-emerald`).
- Les modules `lib/` restent purs (aucun import React, aucun accès réseau) sauf les fichiers `*-api.ts` et `hooks.ts`.
- Aucune migration n'est appliquée par l'agent : les fichiers `supabase/*.sql` sont exécutés à la main par l'utilisateur dans le SQL editor.
- Commits en anglais, format `type(scope): message`, avec la ligne `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Tests : `npm run test` (Vitest). Vérification finale : `npx tsc --noEmit` puis `npm run build`.

---

### Task 1: Test de caractérisation du simulateur (garde-fou)

`lib/simulator.ts` n'a aucun test aujourd'hui. Avant de toucher au calcul d'abondement, on fige son comportement actuel. Ce test doit rester vert, aux mêmes valeurs, après la refonte de la Task 4.

**Files:**
- Create: `lib/simulator.test.ts`

**Interfaces:**
- Consumes: `simulateAll(p: SimulationParams): SimulationResult[]` et `DEFAULT_PARAMS` (déjà existants).
- Produces: rien pour les autres tâches — c'est un filet de sécurité.

- [ ] **Step 1: Écrire le test avec des snapshots inline vides**

On utilise `toMatchInlineSnapshot()` sans argument : Vitest remplit lui-même les valeurs au premier run, ce qui évite de recopier à la main des nombres à 10 décimales.

Créer `lib/simulator.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { simulateAll } from "./simulator";
import { DEFAULT_PARAMS } from "./strategies";
import type { SimulationParams } from "./types";

/** Résumés arrondis au centime, pour un diff lisible. */
function summaries(p: SimulationParams) {
  return simulateAll(p).map((r) => ({
    strategy: r.strategy,
    net_total: Math.round(r.summary.net_total * 100) / 100,
    gross_total: Math.round(r.summary.gross_total * 100) / 100,
    tax_total: Math.round(r.summary.tax_total * 100) / 100,
    multiplier: Math.round(r.summary.multiplier * 10000) / 10000,
  }));
}

describe("simulateAll (caractérisation du barème Carrefour)", () => {
  it("fige les résultats des paramètres par défaut", () => {
    expect(summaries(DEFAULT_PARAMS)).toMatchInlineSnapshot();
  });

  it("fige les résultats d'un profil à forts versements", () => {
    const p: SimulationParams = {
      ...DEFAULT_PARAMS,
      interessement: 3000,
      participation: 2000,
      volontaire: 2500,
      years: 15,
      rate: 0.04,
    };
    expect(summaries(p)).toMatchInlineSnapshot();
  });

  it("fige les résultats sans aucun versement", () => {
    const p: SimulationParams = {
      ...DEFAULT_PARAMS,
      interessement: 0,
      participation: 0,
      volontaire: 0,
    };
    expect(summaries(p)).toMatchInlineSnapshot();
  });
});
```

- [ ] **Step 2: Lancer les tests pour que Vitest remplisse les snapshots**

Run: `npx vitest run lib/simulator.test.ts --update`
Expected: PASS (3 tests), et le fichier contient maintenant les valeurs réelles dans les `toMatchInlineSnapshot(...)`.

- [ ] **Step 3: Relire les valeurs générées**

Ouvrir `lib/simulator.test.ts` et vérifier que les snapshots sont plausibles : six entrées (stratégies `A` à `F`), `net_total` positifs et différents d'une stratégie à l'autre dans les deux premiers tests. Dans le troisième (aucun versement) les totaux valent 0 — c'est normal, les capitaux initiaux sont nuls dans `DEFAULT_PARAMS`.

- [ ] **Step 4: Relancer sans `--update` pour confirmer la stabilité**

Run: `npx vitest run lib/simulator.test.ts`
Expected: PASS (3 tests), aucun snapshot réécrit.

- [ ] **Step 5: Commit**

```bash
git add lib/simulator.test.ts
git commit -m "test(simulator): characterization snapshots before abondement refactor

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Module `lib/abondement.ts` — types, défaut Carrefour, calcul par tranches

**Files:**
- Create: `lib/abondement.ts`
- Test: `lib/abondement.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `type Tranche = { upTo: number | null; rate: number }`
  - `type PlanBareme = { interessement: Tranche[]; participation: Tranche[]; volontaire: Tranche[] }`
  - `type AbondementBareme = { peg: PlanBareme; per: PlanBareme }`
  - `const DEFAULT_BAREME: AbondementBareme`
  - `function computeAbondement(plan: PlanBareme, I: number, P: number, V: number): number`
  - `const SOURCE_KEYS: readonly ["interessement", "participation", "volontaire"]`
  - `const SOURCE_LABELS: Record<"interessement" | "participation" | "volontaire", string>`

- [ ] **Step 1: Écrire les tests qui échouent**

Les valeurs attendues viennent du barème Carrefour actuellement codé dans `lib/simulator.ts` :
PEG intéressement 0–450 @ 40 % puis 20 %, participation nulle, volontaire 20 % ;
PER intéressement 0–1000 @ 50 % puis 20 %, participation 30 %, volontaire 0–550 @ 100 %, 550–2000 @ 50 %, au-delà 25 %.

Créer `lib/abondement.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { computeAbondement, DEFAULT_BAREME } from "./abondement";
import type { PlanBareme } from "./abondement";

const plan = (p: Partial<PlanBareme>): PlanBareme => ({
  interessement: [],
  participation: [],
  volontaire: [],
  ...p,
});

describe("computeAbondement", () => {
  it("renvoie 0 quand aucune tranche n'est définie", () => {
    expect(computeAbondement(plan({}), 1000, 1000, 1000)).toBe(0);
  });

  it("applique une tranche unique non plafonnée", () => {
    const p = plan({ volontaire: [{ upTo: null, rate: 0.2 }] });
    expect(computeAbondement(p, 0, 0, 1000)).toBe(200);
  });

  it("répartit un montant à cheval sur deux tranches", () => {
    const p = plan({
      interessement: [
        { upTo: 450, rate: 0.4 },
        { upTo: null, rate: 0.2 },
      ],
    });
    // 450 * 0.4 = 180, puis 1050 * 0.2 = 210
    expect(computeAbondement(p, 1500, 0, 0)).toBe(390);
  });

  it("n'abonde rien au-delà de la dernière tranche plafonnée", () => {
    const p = plan({ volontaire: [{ upTo: 500, rate: 0.5 }] });
    expect(computeAbondement(p, 0, 0, 800)).toBe(250);
  });

  it("additionne les trois sources", () => {
    const p = plan({
      interessement: [{ upTo: null, rate: 0.1 }],
      participation: [{ upTo: null, rate: 0.2 }],
      volontaire: [{ upTo: null, rate: 0.3 }],
    });
    expect(computeAbondement(p, 100, 100, 100)).toBe(60);
  });

  it("traite les montants nuls ou négatifs comme zéro", () => {
    const p = plan({ volontaire: [{ upTo: null, rate: 0.2 }] });
    expect(computeAbondement(p, 0, 0, 0)).toBe(0);
    expect(computeAbondement(p, 0, 0, -500)).toBe(0);
  });
});

describe("DEFAULT_BAREME (non-régression Carrefour)", () => {
  it("reproduit l'abondement PEG des paramètres par défaut", () => {
    // I=1500 → 180 + 210 = 390 ; P=1500 → 0 ; V=1000 → 200
    expect(computeAbondement(DEFAULT_BAREME.peg, 1500, 1500, 1000)).toBe(590);
  });

  it("reproduit l'abondement PER des paramètres par défaut", () => {
    // I=1500 → 500 + 100 = 600 ; P=1500 → 450 ; V=1000 → 550 + 225 = 775
    expect(computeAbondement(DEFAULT_BAREME.per, 1500, 1500, 1000)).toBe(1825);
  });

  it("n'abonde pas la participation sur le PEG", () => {
    expect(computeAbondement(DEFAULT_BAREME.peg, 0, 5000, 0)).toBe(0);
  });

  it("applique la troisième tranche du volontaire PER", () => {
    // 550 * 1 + 1450 * 0.5 + 1000 * 0.25 = 550 + 725 + 250
    expect(computeAbondement(DEFAULT_BAREME.per, 0, 0, 3000)).toBe(1525);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/abondement.test.ts`
Expected: FAIL — « Failed to resolve import "./abondement" ».

- [ ] **Step 3: Écrire le module**

Créer `lib/abondement.ts` :

```ts
/**
 * Barème d'abondement employeur, décrit par tranches.
 * `upTo` = borne haute de la tranche en euros ; `null` = « au-delà » (non plafonné).
 * Les tranches sont ordonnées par `upTo` croissant, `null` en dernier.
 */
export type Tranche = { upTo: number | null; rate: number };

export type SourceKey = "interessement" | "participation" | "volontaire";

export type PlanBareme = Record<SourceKey, Tranche[]>;

export type AbondementBareme = { peg: PlanBareme; per: PlanBareme };

export const SOURCE_KEYS = [
  "interessement",
  "participation",
  "volontaire",
] as const satisfies readonly SourceKey[];

export const SOURCE_LABELS: Record<SourceKey, string> = {
  interessement: "Intéressement",
  participation: "Participation",
  volontaire: "Volontaire",
};

/** Barème Carrefour — valeurs historiques de lib/simulator.ts. */
export const DEFAULT_BAREME: AbondementBareme = {
  peg: {
    interessement: [
      { upTo: 450, rate: 0.4 },
      { upTo: null, rate: 0.2 },
    ],
    participation: [],
    volontaire: [{ upTo: null, rate: 0.2 }],
  },
  per: {
    interessement: [
      { upTo: 1000, rate: 0.5 },
      { upTo: null, rate: 0.2 },
    ],
    participation: [{ upTo: null, rate: 0.3 }],
    volontaire: [
      { upTo: 550, rate: 1.0 },
      { upTo: 2000, rate: 0.5 },
      { upTo: null, rate: 0.25 },
    ],
  },
};

/** Applique un barème de tranches à un montant annuel versé. */
function applyTranches(tranches: Tranche[], amount: number): number {
  const a = Math.max(0, amount);
  let previous = 0;
  let total = 0;
  for (const t of tranches) {
    const upper = t.upTo === null ? Infinity : t.upTo;
    const slice = Math.max(0, Math.min(a, upper) - previous);
    total += slice * t.rate;
    previous = upper;
    if (a <= upper) break;
  }
  return total;
}

/**
 * Abondement employeur total pour un plan, à partir des versements annuels
 * bruts : I = intéressement, P = participation, V = volontaire.
 */
export function computeAbondement(
  plan: PlanBareme,
  I: number,
  P: number,
  V: number
): number {
  return (
    applyTranches(plan.interessement, I) +
    applyTranches(plan.participation, P) +
    applyTranches(plan.volontaire, V)
  );
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run lib/abondement.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/abondement.ts lib/abondement.test.ts
git commit -m "feat(abondement): tranche-based barème model with Carrefour default

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Validation et parsing tolérant du barème

Un barème vient soit d'un formulaire, soit d'une colonne JSONB. Les deux peuvent être invalides ; l'écran Épargne ne doit jamais planter à cause de ça.

**Files:**
- Modify: `lib/abondement.ts`
- Test: `lib/abondement.test.ts`

**Interfaces:**
- Consumes: `Tranche`, `PlanBareme`, `AbondementBareme`, `DEFAULT_BAREME` (Task 2).
- Produces:
  - `function baremeError(b: unknown): string | null` — message en français, ou `null` si valide.
  - `function parseBareme(raw: unknown): AbondementBareme` — ne lève jamais ; retombe sur une copie de `DEFAULT_BAREME`.
  - `function cloneBareme(b: AbondementBareme): AbondementBareme` — copie profonde, utilisée par la modale d'édition.
  - `function isDefaultBareme(b: AbondementBareme): boolean`

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à la fin de `lib/abondement.test.ts` (et compléter la ligne d'import du haut du fichier pour qu'elle devienne
`import { baremeError, computeAbondement, DEFAULT_BAREME, isDefaultBareme, parseBareme } from "./abondement";`) :

```ts
describe("baremeError", () => {
  it("accepte le barème par défaut", () => {
    expect(baremeError(DEFAULT_BAREME)).toBeNull();
  });

  it("accepte des sources vides", () => {
    const b = { peg: plan({}), per: plan({}) };
    expect(baremeError(b)).toBeNull();
  });

  it("refuse autre chose qu'un objet", () => {
    expect(baremeError(null)).not.toBeNull();
    expect(baremeError("peg")).not.toBeNull();
    expect(baremeError(42)).not.toBeNull();
  });

  it("refuse un plan manquant", () => {
    expect(baremeError({ peg: plan({}) })).not.toBeNull();
  });

  it("refuse une source qui n'est pas un tableau", () => {
    const b = { peg: { ...plan({}), volontaire: 0.2 }, per: plan({}) };
    expect(baremeError(b)).not.toBeNull();
  });

  it("refuse des seuils non croissants", () => {
    const b = {
      peg: plan({
        volontaire: [
          { upTo: 1000, rate: 0.2 },
          { upTo: 500, rate: 0.1 },
        ],
      }),
      per: plan({}),
    };
    expect(baremeError(b)).toContain("croissant");
  });

  it("refuse une tranche « au-delà » ailleurs qu'en dernier", () => {
    const b = {
      peg: plan({
        volontaire: [
          { upTo: null, rate: 0.2 },
          { upTo: 500, rate: 0.1 },
        ],
      }),
      per: plan({}),
    };
    expect(baremeError(b)).not.toBeNull();
  });

  it("refuse un taux négatif ou aberrant", () => {
    const neg = { peg: plan({ volontaire: [{ upTo: null, rate: -0.1 }] }), per: plan({}) };
    const huge = { peg: plan({ volontaire: [{ upTo: null, rate: 3 }] }), per: plan({}) };
    expect(baremeError(neg)).not.toBeNull();
    expect(baremeError(huge)).not.toBeNull();
  });

  it("refuse un seuil nul ou négatif", () => {
    const b = { peg: plan({ volontaire: [{ upTo: 0, rate: 0.2 }] }), per: plan({}) };
    expect(baremeError(b)).not.toBeNull();
  });

  it("nomme le plan et la source fautifs", () => {
    const b = { peg: plan({}), per: plan({ participation: [{ upTo: null, rate: 9 }] }) };
    const msg = baremeError(b) ?? "";
    expect(msg).toContain("PER");
    expect(msg).toContain("Participation");
  });
});

describe("parseBareme", () => {
  it("retombe sur le défaut pour null ou undefined", () => {
    expect(parseBareme(null)).toEqual(DEFAULT_BAREME);
    expect(parseBareme(undefined)).toEqual(DEFAULT_BAREME);
  });

  it("retombe sur le défaut pour un objet invalide", () => {
    expect(parseBareme({ peg: "nope" })).toEqual(DEFAULT_BAREME);
    expect(parseBareme({ hello: "world" })).toEqual(DEFAULT_BAREME);
  });

  it("conserve un barème valide", () => {
    const custom = {
      peg: plan({ volontaire: [{ upTo: null, rate: 0.5 }] }),
      per: plan({}),
    };
    expect(parseBareme(custom)).toEqual(custom);
  });

  it("renvoie une copie, pas la constante partagée", () => {
    const parsed = parseBareme(null);
    parsed.peg.volontaire.push({ upTo: null, rate: 0.9 });
    expect(DEFAULT_BAREME.peg.volontaire).toHaveLength(1);
  });
});

describe("isDefaultBareme", () => {
  it("reconnaît le barème Carrefour", () => {
    expect(isDefaultBareme(DEFAULT_BAREME)).toBe(true);
    expect(isDefaultBareme(parseBareme(null))).toBe(true);
  });

  it("détecte un barème personnalisé", () => {
    const custom = parseBareme(null);
    custom.peg.volontaire[0].rate = 0.25;
    expect(isDefaultBareme(custom)).toBe(false);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/abondement.test.ts`
Expected: FAIL — `baremeError is not a function` (et les mêmes pour `parseBareme` / `isDefaultBareme`).

- [ ] **Step 3: Implémenter validation, parsing et comparaison**

Ajouter à la fin de `lib/abondement.ts` :

```ts
const PLAN_LABELS = { peg: "PEG", per: "PER" } as const;

function trancheListError(list: unknown, where: string): string | null {
  if (!Array.isArray(list)) return `${where} : liste de tranches invalide.`;
  let previous = 0;
  for (let i = 0; i < list.length; i++) {
    const t = list[i] as Tranche;
    if (!t || typeof t !== "object") return `${where} : tranche invalide.`;
    const rate = Number(t.rate);
    if (!isFinite(rate) || rate < 0 || rate > 2)
      return `${where} : taux invalide (entre 0 et 200 %).`;
    if (t.upTo === null) {
      if (i !== list.length - 1)
        return `${where} : la tranche « au-delà » doit être la dernière.`;
      continue;
    }
    const upTo = Number(t.upTo);
    if (!isFinite(upTo) || upTo <= 0)
      return `${where} : seuil invalide (montant positif attendu).`;
    if (upTo <= previous)
      return `${where} : les seuils doivent être croissants.`;
    previous = upTo;
  }
  return null;
}

function planError(plan: unknown, planLabel: string): string | null {
  if (!plan || typeof plan !== "object")
    return `${planLabel} : barème manquant.`;
  for (const key of SOURCE_KEYS) {
    const err = trancheListError(
      (plan as Record<string, unknown>)[key],
      `${planLabel} · ${SOURCE_LABELS[key]}`
    );
    if (err) return err;
  }
  return null;
}

/** Message d'erreur en français, ou null si le barème est exploitable. */
export function baremeError(b: unknown): string | null {
  if (!b || typeof b !== "object") return "Barème manquant ou illisible.";
  const rec = b as Record<string, unknown>;
  return (
    planError(rec.peg, PLAN_LABELS.peg) ?? planError(rec.per, PLAN_LABELS.per)
  );
}

function clonePlan(p: PlanBareme): PlanBareme {
  return {
    interessement: p.interessement.map((t) => ({ ...t })),
    participation: p.participation.map((t) => ({ ...t })),
    volontaire: p.volontaire.map((t) => ({ ...t })),
  };
}

export function cloneBareme(b: AbondementBareme): AbondementBareme {
  return { peg: clonePlan(b.peg), per: clonePlan(b.per) };
}

/**
 * Lit un barème venu de la base (JSONB) ou d'un formulaire.
 * Ne lève jamais : tout ce qui est invalide retombe sur le barème par défaut.
 */
export function parseBareme(raw: unknown): AbondementBareme {
  if (baremeError(raw) !== null) return cloneBareme(DEFAULT_BAREME);
  const b = raw as AbondementBareme;
  return cloneBareme({
    peg: normalizePlan(b.peg),
    per: normalizePlan(b.per),
  });
}

function normalizePlan(p: PlanBareme): PlanBareme {
  return {
    interessement: p.interessement.map(normalizeTranche),
    participation: p.participation.map(normalizeTranche),
    volontaire: p.volontaire.map(normalizeTranche),
  };
}

function normalizeTranche(t: Tranche): Tranche {
  return {
    upTo: t.upTo === null ? null : Number(t.upTo),
    rate: Number(t.rate),
  };
}

/** Vrai si le barème est exactement le barème Carrefour par défaut. */
export function isDefaultBareme(b: AbondementBareme): boolean {
  return JSON.stringify(b) === JSON.stringify(DEFAULT_BAREME);
}
```

Note : `isDefaultBareme` compare via `JSON.stringify`, ce qui est fiable ici parce que `parseBareme` et `DEFAULT_BAREME` produisent toujours les clés dans le même ordre (`upTo` puis `rate`, sources dans l'ordre de `SOURCE_KEYS`).

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run lib/abondement.test.ts`
Expected: PASS (26 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/abondement.ts lib/abondement.test.ts
git commit -m "feat(abondement): baremeError validation and tolerant parseBareme

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Brancher le simulateur sur le barème

**Files:**
- Modify: `lib/types.ts` (interface `SimulationParams`)
- Modify: `lib/strategies.ts:71-94` (`DEFAULT_PARAMS`)
- Modify: `lib/simulator.ts:9-39` (suppression des fonctions codées en dur) et `lib/simulator.ts:58-59`
- Modify: `lib/cockpit/projection-sim.ts`
- Test: `lib/simulator.test.ts` (déjà écrit, doit rester vert sans changement), `lib/cockpit/projection-sim.test.ts`

**Interfaces:**
- Consumes: `computeAbondement`, `DEFAULT_BAREME`, `AbondementBareme` (Tasks 2–3).
- Produces:
  - `SimulationParams` gagne le champ obligatoire `bareme: AbondementBareme`.
  - `buildSimParams(input: { volontaire: number; rate: number; years: number; bareme?: AbondementBareme }): SimulationParams`.

- [ ] **Step 1: Écrire le test qui échoue sur `buildSimParams`**

Ajouter dans `lib/cockpit/projection-sim.test.ts` (à l'intérieur du `describe("buildSimParams", …)` existant) :

```ts
  it("utilise le barème par défaut quand aucun n'est fourni", () => {
    const p = buildSimParams({ volontaire: 1000, rate: 0.05, years: 10 });
    expect(p.bareme).toEqual(DEFAULT_BAREME);
  });

  it("transmet le barème fourni", () => {
    const custom = {
      peg: { interessement: [], participation: [], volontaire: [] },
      per: { interessement: [], participation: [], volontaire: [] },
    };
    const p = buildSimParams({ volontaire: 1000, rate: 0.05, years: 10, bareme: custom });
    expect(p.bareme).toEqual(custom);
  });
```

Et ajouter en haut du fichier : `import { DEFAULT_BAREME } from "@/lib/abondement";`

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run lib/cockpit/projection-sim.test.ts`
Expected: FAIL — `expected undefined to deeply equal { peg: …` (le champ `bareme` n'existe pas encore).

- [ ] **Step 3: Ajouter le champ au type et au défaut**

Dans `lib/types.ts`, ajouter l'import en tête de fichier :

```ts
import type { AbondementBareme } from "./abondement";
```

puis, dans `interface SimulationParams`, juste après le bloc « Versements annuels (bruts) » (`volontaire: number;`) :

```ts
  // Barème d'abondement employeur (défaut : Carrefour)
  bareme: AbondementBareme;
```

Dans `lib/strategies.ts`, ajouter l'import :

```ts
import { DEFAULT_BAREME } from "./abondement";
```

puis, dans l'objet `DEFAULT_PARAMS`, après `volontaire: 1000,` :

```ts
  bareme: DEFAULT_BAREME,
```

- [ ] **Step 4: Remplacer les fonctions codées en dur du simulateur**

Dans `lib/simulator.ts`, supprimer intégralement les deux fonctions `computeAbondementPEG` et `computeAbondementPER` (lignes 9 à 39, commentaires compris) et ajouter l'import :

```ts
import { computeAbondement } from "./abondement";
```

Puis remplacer les deux lignes de calcul (actuellement lignes 58-59) :

```ts
  const baseAbondPEG = computeAbondementPEG(I, P, V);
  const baseAbondPER = computeAbondementPER(I, P, V);
```

par :

```ts
  const baseAbondPEG = computeAbondement(p.bareme.peg, I, P, V);
  const baseAbondPER = computeAbondement(p.bareme.per, I, P, V);
```

Ne toucher à rien d'autre dans ce fichier : le reste de la mécanique (CSG, recyclage, fiscalité de sortie) est inchangé.

- [ ] **Step 5: Accepter un barème dans `buildSimParams`**

Remplacer le contenu de `lib/cockpit/projection-sim.ts` par :

```ts
import { DEFAULT_PARAMS } from "@/lib/strategies";
import { DEFAULT_BAREME, type AbondementBareme } from "@/lib/abondement";
import type { SimulationParams, SimulationResult } from "@/lib/types";

export function buildSimParams(input: {
  volontaire: number;
  rate: number;
  years: number;
  bareme?: AbondementBareme;
}): SimulationParams {
  return {
    ...DEFAULT_PARAMS,
    volontaire: input.volontaire,
    rate: input.rate,
    years: input.years,
    bareme: input.bareme ?? DEFAULT_BAREME,
  };
}

export function rankByNet(results: SimulationResult[]): SimulationResult[] {
  return [...results].sort(
    (a, b) => b.summary.net_total - a.summary.net_total
  );
}
```

- [ ] **Step 6: Lancer toute la suite — le garde-fou doit être vert**

Run: `npm run test`
Expected: PASS pour tous les fichiers. **En particulier `lib/simulator.test.ts` passe sans qu'aucun snapshot ne change** : c'est la preuve que la refonte est iso-chiffres. Si un snapshot diverge, ne pas le mettre à jour — c'est une régression à corriger dans le calcul.

- [ ] **Step 7: Vérifier les types**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

Deux endroits à surveiller si `tsc` proteste :
- `app/page.tsx:14` initialise son état avec `DEFAULT_PARAMS`, qui contient désormais `bareme` — rien à faire.
- `components/ParameterPanel.tsx` indexe `params[f.key] as number` et fait `setParams({ ...params, [key]: value })`. `bareme` n'apparaît dans aucun des tableaux `*_FIELDS`, donc il n'est jamais atteint à l'exécution. Si TypeScript se plaint malgré tout du type de `ParamKey`, restreindre le type aux clés numériques plutôt que d'élargir les casts :

```ts
type ParamKey = {
  [K in keyof SimulationParams]: SimulationParams[K] extends number ? K : never;
}[keyof SimulationParams];
```

- [ ] **Step 8: Commit**

```bash
git add lib/types.ts lib/strategies.ts lib/simulator.ts lib/cockpit/projection-sim.ts lib/cockpit/projection-sim.test.ts
git commit -m "refactor(simulator): read abondement from params bareme instead of hardcoded Carrefour

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Persistance du barème dans `user_settings`

**Files:**
- Create: `supabase/2026-08-24-abondement-bareme.sql`
- Modify: `lib/cockpit/settings.ts`
- Modify: `lib/cockpit/settings.test.ts`
- Modify: `lib/cockpit/user-settings-api.ts`

**Interfaces:**
- Consumes: `parseBareme`, `DEFAULT_BAREME`, `AbondementBareme` (Tasks 2–3).
- Produces:
  - `UserSettings` gagne `abondement_bareme: AbondementBareme` (déjà parsé, jamais brut).
  - `saveAbondementBareme(userId: string, bareme: AbondementBareme): Promise<void>`.
  - `useUserSettings(userId)` (inchangé côté signature) expose donc `settings.abondement_bareme`.

- [ ] **Step 1: Écrire la migration SQL**

Créer `supabase/2026-08-24-abondement-bareme.sql` :

```sql
-- Barème d'abondement employeur par utilisateur. À exécuter dans Supabase SQL editor.
-- NULL = barème Carrefour par défaut (aucune donnée = aucun changement de comportement).
alter table public.user_settings
  add column if not exists abondement_bareme jsonb;
```

Aucune policy à ajouter : `user_settings` est déjà en RLS `auth.uid() = user_id` pour toutes les opérations.

- [ ] **Step 2: Écrire les tests qui échouent sur `coerceSettings`**

Dans `lib/cockpit/settings.test.ts`, remplacer le test « keeps a complete row » (lignes 8-12) par la version ci-dessous et ajouter les deux nouveaux tests ; compléter l'import du haut en `import { coerceSettings, DEFAULT_SETTINGS } from "./settings";` (inchangé) plus `import { DEFAULT_BAREME } from "@/lib/abondement";` :

```ts
  it("keeps a complete row", () => {
    const out = coerceSettings({
      savings_rate_goal: 0.3,
      reporting_currency: "USD",
    });
    expect(out.savings_rate_goal).toBe(0.3);
    expect(out.reporting_currency).toBe("USD");
  });

  it("retombe sur le barème par défaut quand la colonne est vide", () => {
    expect(coerceSettings(null).abondement_bareme).toEqual(DEFAULT_BAREME);
    expect(
      coerceSettings({ reporting_currency: "EUR" }).abondement_bareme
    ).toEqual(DEFAULT_BAREME);
  });

  it("lit le barème personnalisé de la colonne JSONB", () => {
    const custom = {
      peg: { interessement: [], participation: [], volontaire: [{ upTo: null, rate: 0.5 }] },
      per: { interessement: [], participation: [], volontaire: [] },
    };
    expect(
      coerceSettings({ reporting_currency: "EUR", abondement_bareme: custom })
        .abondement_bareme
    ).toEqual(custom);
  });
```

- [ ] **Step 3: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/cockpit/settings.test.ts`
Expected: FAIL — `expected undefined to deeply equal { peg: …` sur `abondement_bareme`.

- [ ] **Step 4: Étendre `settings.ts`**

Remplacer le contenu de `lib/cockpit/settings.ts` par :

```ts
import {
  DEFAULT_BAREME,
  parseBareme,
  type AbondementBareme,
} from "@/lib/abondement";

export type UserSettings = {
  savings_rate_goal: number;
  reporting_currency: string;
  abondement_bareme: AbondementBareme;
};

/** Ligne brute telle qu'elle sort de Postgres (JSONB non typé). */
export type UserSettingsRow = {
  savings_rate_goal?: unknown;
  reporting_currency?: unknown;
  abondement_bareme?: unknown;
};

export const DEFAULT_SETTINGS: UserSettings = {
  savings_rate_goal: 0.2,
  reporting_currency: "EUR",
  abondement_bareme: DEFAULT_BAREME,
};

export const CURRENCIES: string[] = ["EUR", "USD", "GBP", "CHF", "CAD"];

export function coerceSettings(
  row: UserSettingsRow | null | undefined
): UserSettings {
  if (!row)
    return { ...DEFAULT_SETTINGS, abondement_bareme: parseBareme(null) };
  const goal = Number(row.savings_rate_goal);
  const ccy = row.reporting_currency;
  return {
    savings_rate_goal:
      isFinite(goal) && goal > 0 ? goal : DEFAULT_SETTINGS.savings_rate_goal,
    reporting_currency:
      typeof ccy === "string" && ccy.trim()
        ? ccy
        : DEFAULT_SETTINGS.reporting_currency,
    abondement_bareme: parseBareme(row.abondement_bareme),
  };
}
```

- [ ] **Step 5: Étendre l'API Supabase**

Remplacer le contenu de `lib/cockpit/user-settings-api.ts` par :

```ts
import { supabase } from "./supabase";
import type { UserSettingsRow } from "./settings";
import type { AbondementBareme } from "@/lib/abondement";

export async function getUserSettings(
  userId: string
): Promise<UserSettingsRow | null> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("savings_rate_goal,reporting_currency,abondement_bareme")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as UserSettingsRow) ?? null;
}

export async function saveUserSettings(
  userId: string,
  s: { savingsRateGoal: number; reportingCurrency: string }
): Promise<void> {
  const { error } = await supabase.from("user_settings").upsert(
    {
      user_id: userId,
      savings_rate_goal: s.savingsRateGoal,
      reporting_currency: s.reportingCurrency,
    },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(error.message);
}

/**
 * N'écrit que la colonne du barème : les autres colonnes gardent leur valeur
 * (ou leur défaut SQL si la ligne n'existe pas encore).
 */
export async function saveAbondementBareme(
  userId: string,
  bareme: AbondementBareme
): Promise<void> {
  const { error } = await supabase.from("user_settings").upsert(
    { user_id: userId, abondement_bareme: bareme },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 6: Lancer les tests et les types**

Run: `npx vitest run lib/cockpit/settings.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: aucune erreur. `lib/cockpit/hooks.ts` continue de fonctionner sans changement : `coerceSettings` accepte toujours la ligne renvoyée par `getUserSettings`.

- [ ] **Step 7: Commit**

```bash
git add supabase/2026-08-24-abondement-bareme.sql lib/cockpit/settings.ts lib/cockpit/settings.test.ts lib/cockpit/user-settings-api.ts
git commit -m "feat(abondement): persist per-user barème in user_settings jsonb column

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Édition du barème dans l'onglet Épargne

**Files:**
- Create: `components/cockpit/projection/BaremeModal.tsx`
- Modify: `components/cockpit/projection/SimulatorView.tsx`
- Modify: `app/cockpit/epargne/page.tsx`
- Modify: `app/page.tsx:68-71` (footer trompeur)

**Interfaces:**
- Consumes: `AbondementBareme`, `DEFAULT_BAREME`, `SOURCE_KEYS`, `SOURCE_LABELS`, `baremeError`, `cloneBareme`, `isDefaultBareme` (Tasks 2–3) ; `saveAbondementBareme` (Task 5) ; `useAuth`, `useUserSettings` (existants) ; `buildSimParams` avec `bareme` (Task 4).
- Produces: rien pour les tâches suivantes — c'est la dernière.

- [ ] **Step 1: Écrire la modale d'édition**

Créer `components/cockpit/projection/BaremeModal.tsx` :

```tsx
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
    patch(source, [...draft[plan][source], { upTo: null, rate: 0 }]);
  };

  const removeTranche = (source: SourceKey, i: number) => {
    patch(
      source,
      draft[plan][source].filter((_, j) => j !== i)
    );
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
                {rows.map((t, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <label className="grid gap-1 flex-1">
                      <span className={labelCls}>Jusqu&apos;à (€)</span>
                      <input
                        className={field}
                        type="text"
                        inputMode="decimal"
                        placeholder="au-delà"
                        value={t.upTo === null ? "" : String(t.upTo)}
                        onChange={(e) => {
                          const raw = e.target.value.replace(",", ".").trim();
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
                        value={String(Math.round(t.rate * 1000) / 10)}
                        onChange={(e) => {
                          const raw = e.target.value.replace(",", ".").trim();
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
                ))}
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
```

- [ ] **Step 2: Brancher `SimulatorView` sur le barème de l'utilisateur**

Remplacer le contenu de `components/cockpit/projection/SimulatorView.tsx` par :

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { simulateAll } from "@/lib/simulator";
import { DEFAULT_PARAMS } from "@/lib/strategies";
import { isDefaultBareme } from "@/lib/abondement";
import { buildSimParams, rankByNet } from "@/lib/cockpit/projection-sim";
import { useAuth, useUserSettings } from "@/lib/cockpit/hooks";
import { SimulatorControls } from "./SimulatorControls";
import { StrategyRankList } from "./StrategyRankList";
import { BaremeModal } from "./BaremeModal";

export function SimulatorView({ avgFlow }: { avgFlow: number }) {
  const user = useAuth();
  const { settings, refetch } = useUserSettings(user.id);
  const [volontaire, setVolontaire] = useState(0);
  const [touched, setTouched] = useState(false);
  const [rate, setRate] = useState(DEFAULT_PARAMS.rate);
  const [years, setYears] = useState(DEFAULT_PARAMS.years);
  const [showBareme, setShowBareme] = useState(false);

  const bareme = settings.abondement_bareme;

  useEffect(() => {
    if (!touched && avgFlow > 0) setVolontaire(Math.round(avgFlow * 12));
  }, [avgFlow, touched]);

  const ranked = useMemo(
    () => rankByNet(simulateAll(buildSimParams({ volontaire, rate, years, bareme }))),
    [volontaire, rate, years, bareme]
  );

  const setVol = (v: number) => {
    setTouched(true);
    setVolontaire(v);
  };

  const isDefault = isDefaultBareme(bareme);

  return (
    <>
      <SimulatorControls
        volontaire={volontaire}
        onVolontaire={setVol}
        rate={rate}
        onRate={setRate}
        years={years}
        onYears={setYears}
      />
      <button
        type="button"
        onClick={() => setShowBareme(true)}
        className="flex items-center justify-between w-full border border-rule rounded-lg px-3 py-3 bg-card mb-6 text-left"
      >
        <span className="text-[13px] text-ink-muted">Barème d&apos;abondement</span>
        <span className="flex items-center gap-1 text-[13px] text-ink font-medium">
          {isDefault ? "Carrefour (défaut)" : "Personnalisé"}
          <ChevronRight size={15} className="text-ink-muted" />
        </span>
      </button>
      <StrategyRankList ranked={ranked} />
      <p className="text-[11px] text-ink-muted mt-4">
        {isDefault
          ? "Hypothèses par défaut (abondement Carrefour)."
          : "Calculé avec votre barème d'abondement."}{" "}
        Réglage fin complet sur la page principale.
      </p>
      {showBareme && (
        <BaremeModal
          userId={user.id}
          bareme={bareme}
          onClose={() => setShowBareme(false)}
          onSaved={() => {
            refetch();
            setShowBareme(false);
          }}
        />
      )}
    </>
  );
}
```

`app/cockpit/epargne/page.tsx` n'a besoin d'aucune modification : il est déjà sous le `AuthContext.Provider` de `app/cockpit/layout.tsx`, donc `useAuth()` fonctionne dans `SimulatorView`. Vérifier ce point en lisant `app/cockpit/layout.tsx` ; si le provider n'englobait pas la route, passer `userId` en prop depuis la page.

- [ ] **Step 3: Corriger le footer trompeur de la page legacy**

Dans `app/page.tsx`, remplacer le second paragraphe du footer (lignes 68-71) :

```tsx
            <p>
              Construit à partir des barèmes d&apos;abondement Carrefour
              (cible Khalid). Modifiable dans <code>lib/strategies.ts</code>.
            </p>
```

par :

```tsx
            <p>
              Barème d&apos;abondement Carrefour par défaut. Pour utiliser le
              vôtre, ouvrez l&apos;onglet Épargne de l&apos;app.
            </p>
```

- [ ] **Step 4: Vérifier types, tests et build**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

Run: `npm run test`
Expected: PASS partout, snapshots de `lib/simulator.test.ts` inchangés.

Run: `npm run build`
Expected: build Next.js réussi.

- [ ] **Step 5: Commit**

```bash
git add components/cockpit/projection/BaremeModal.tsx components/cockpit/projection/SimulatorView.tsx app/page.tsx
git commit -m "feat(abondement): edit per-user barème from the Épargne tab

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Smoke test manuel (à faire par l'utilisateur)**

1. Exécuter `supabase/2026-08-24-abondement-bareme.sql` dans le SQL editor Supabase.
2. `npm run dev`, ouvrir l'onglet **Épargne** : la ligne affiche « Carrefour (défaut) » et le classement des stratégies est identique à avant.
3. Ouvrir la modale, passer le volontaire PEG de 20 % à 50 %, enregistrer : le classement change, la ligne affiche « Personnalisé ».
4. Recharger la page : le barème personnalisé est toujours là.
5. Rouvrir la modale, « Réinitialiser (Carrefour) » puis enregistrer : retour à l'état initial.

---

## Notes d'exécution

- L'ordre des tâches est contraignant : la Task 1 doit être commitée **avant** la Task 4, sinon la refonte du simulateur se fait sans filet.
- Si un snapshot de `lib/simulator.test.ts` change en Task 4, c'est un bug du nouveau calcul par tranches — corriger `applyTranches` ou `DEFAULT_BAREME`, jamais le snapshot.
- La migration SQL n'est pas appliquée par l'agent. Tant qu'elle n'est pas exécutée, `getUserSettings` échouera sur la colonne inconnue : c'est attendu, le smoke test de la Task 6 commence par elle.
