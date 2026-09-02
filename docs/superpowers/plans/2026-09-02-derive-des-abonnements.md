# Dérive des abonnements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un écran qui répond à « qu'est-ce qui a augmenté sans que je le voie » : les abonnements dont le montant mensuel monte, ce que la hausse coûte sur un an, et de quoi recaler ou suivre l'engagement concerné.

**Architecture :** un module pur ajuste une droite des moindres carrés sur les totaux mensuels de chaque commerçant et ne retient que les hausses qui passent trois seuils cumulés ; la fiche commerçant de l'écran Commerçants est extraite en composant partagé ; un écran à deux sections liste les dérives et porte les actions.

**Tech Stack :** Next.js 15 (App Router), React 19, TypeScript, Tailwind 3, Supabase, Vitest 4, lucide-react.

**Spec :** `docs/superpowers/specs/2026-09-02-derive-des-abonnements-design.md`

## Global Constraints

- Le français est la langue de toute l'UI et des messages affichés, accord du pluriel compris.
- Icônes : **lucide-react** uniquement, jamais d'emoji.
- Montants et valeurs numériques en `.font-mono-num` ; tokens Boussole (`text-ink`, `text-ink-muted`, `bg-card`, `bg-paper`, `bg-tile`, `border-rule`, `text-accent`, `bg-seg`, `bg-emerald`, `text-strat-a`).
- Les modules `lib/` restent purs (aucun import React, aucun accès réseau) sauf `*-api.ts`, `hooks.ts` et `use-*.ts`.
- Aucune migration SQL dans ce chantier : ni table, ni vue, ni colonne.
- Commits en anglais, format `type(scope): message`, avec la ligne `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Tests : `npm run test` (Vitest 4). Vérification finale : `npx tsc --noEmit` puis `npm run build`.
- **Ne jamais lancer vitest avec `--update` ou `-u`** : `lib/simulator.test.ts` contient des snapshots de caractérisation d'un autre chantier.
- **Les trois seuils sont cumulés** : 5 mois observés, R² > 0,5, impact annuel ≥ 20 €. Le R² n'est pas décoratif — c'est lui qui empêche les postes variables (courses, essence), dont la pente est grande et l'ajustement nul, de saturer la liste.
- **Seules les hausses sont listées.** Une baisse ne répond pas à la question de l'écran.

---

### Task 1: Module `drift.ts`

**Files:**
- Create: `lib/cockpit/drift.ts`
- Test: `lib/cockpit/drift.test.ts`

**Interfaces:**
- Consumes: `Txn` (`lib/cockpit/types.ts`), `merchantKey` (`lib/cockpit/payee-key.ts`).
- Produces:
  - `type DriftPoint = { month: string; total: number }`
  - `type Drift = { key: string; label: string; monthsSeen: number; slope: number; r2: number; annualImpact: number; recent: number; series: DriftPoint[] }`
  - `const MIN_MONTHS = 5`, `const MIN_R2 = 0.5`, `const MIN_ANNUAL = 20`
  - `function merchantDrifts(txns: Txn[], today: string): Drift[]`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `lib/cockpit/drift.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { merchantDrifts } from "./drift";
import type { Txn } from "./types";

let seq = 0;
const t = (date: string, amount: number, description = "NETFLIX"): Txn => ({
  id: `t${seq++}`,
  date,
  amount: -amount,
  description,
  type: "expense",
});

/** Une opération par mois, montants donnés dans l'ordre des mois. */
const monthly = (
  months: string[],
  amounts: number[],
  description = "NETFLIX"
): Txn[] => months.map((m, i) => t(`${m}-05`, amounts[i], description));

const TODAY = "2026-08-15";

describe("merchantDrifts", () => {
  it("retient une hausse régulière et en chiffre l'impact annuel", () => {
    // 6 mois, +2 € par mois : pente 2, ajustement parfait, 24 €/an.
    const out = merchantDrifts(
      monthly(
        ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"],
        [100, 102, 104, 106, 108, 110]
      ),
      TODAY
    );
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe("netflix");
    expect(out[0].monthsSeen).toBe(6);
    expect(out[0].slope).toBeCloseTo(2);
    expect(out[0].r2).toBeCloseTo(1);
    expect(out[0].annualImpact).toBeCloseTo(24);
    // Médiane des 3 derniers mois observés : 106, 108, 110.
    expect(out[0].recent).toBeCloseTo(108);
  });

  it("écarte une série plate", () => {
    const out = merchantDrifts(
      monthly(
        ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"],
        [50, 50, 50, 50, 50, 50]
      ),
      TODAY
    );
    expect(out).toEqual([]);
  });

  it("écarte un poste variable : grosse pente, ajustement nul", () => {
    // Pente ≈ 31,7 €/mois, soit 380 €/an — largement au-dessus du seuil
    // d'impact. C'est le R² (≈ 0,15) qui l'élimine, et c'est tout l'intérêt
    // de ce garde-fou : sans lui, les courses satureraient la liste.
    const out = merchantDrifts(
      monthly(
        ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"],
        [100, 400, 120, 380, 150, 420],
        "CARREFOUR"
      ),
      TODAY
    );
    expect(out).toEqual([]);
  });

  it("écarte une hausse nette observée sur moins de 5 mois", () => {
    const out = merchantDrifts(
      monthly(["2026-03", "2026-04", "2026-05", "2026-06"], [100, 110, 120, 130]),
      TODAY
    );
    expect(out).toEqual([]);
  });

  it("retient la même hausse dès le cinquième mois", () => {
    const out = merchantDrifts(
      monthly(
        ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07"],
        [100, 110, 120, 130, 140]
      ),
      TODAY
    );
    expect(out).toHaveLength(1);
    expect(out[0].monthsSeen).toBe(5);
    expect(out[0].slope).toBeCloseTo(10);
    expect(out[0].recent).toBeCloseTo(130);
  });

  it("écarte une hausse trop petite pour appeler une action", () => {
    // +1,50 €/mois → 18 €/an, sous le seuil de 20 €, malgré un ajustement
    // parfait.
    const out = merchantDrifts(
      monthly(
        ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"],
        [100, 101.5, 103, 104.5, 106, 107.5]
      ),
      TODAY
    );
    expect(out).toEqual([]);
  });

  it("exclut le mois en cours, partiel par nature", () => {
    // Le mois d'août est en cours : l'abonnement n'y a été prélevé qu'en
    // partie. S'il comptait, la pente s'effondrerait et la ligne
    // disparaîtrait — c'est exactement ce que le test interdit.
    const out = merchantDrifts(
      [
        ...monthly(
          ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07"],
          [100, 110, 120, 130, 140]
        ),
        t("2026-08-02", 5),
      ],
      TODAY
    );
    expect(out).toHaveLength(1);
    expect(out[0].monthsSeen).toBe(5);
    expect(out[0].slope).toBeCloseTo(10);
  });

  it("compte les mois calendaires, pas les points observés", () => {
    // Quatre mois consécutifs puis un trou de quatre mois. Sur un axe en
    // rang, la pente vaudrait 18 ; sur l'axe calendaire, les cinq points
    // sont exactement alignés sur +10 €/mois.
    const out = merchantDrifts(
      monthly(
        ["2026-01", "2026-02", "2026-03", "2026-04", "2026-09"],
        [100, 110, 120, 130, 180]
      ),
      "2026-10-15"
    );
    expect(out).toHaveLength(1);
    expect(out[0].slope).toBeCloseTo(10);
    expect(out[0].r2).toBeCloseTo(1);
  });

  it("prend pour montant récent la médiane des 3 derniers mois, pas la droite", () => {
    // Derniers mois observés : 16, 18, 40 → médiane 18. La droite prédirait
    // ≈ 34 au dernier mois et le dernier relevé vaut 40 : un montant attendu
    // doit être un nombre qui s'est produit, pas une sortie de modèle.
    const out = merchantDrifts(
      monthly(
        ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"],
        [10, 12, 14, 16, 18, 40]
      ),
      TODAY
    );
    expect(out).toHaveLength(1);
    expect(out[0].recent).toBeCloseTo(18);
  });

  it("classe par impact annuel décroissant", () => {
    const out = merchantDrifts(
      [
        ...monthly(
          ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"],
          [100, 102, 104, 106, 108, 110],
          "NETFLIX"
        ),
        ...monthly(
          ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"],
          [200, 210, 220, 230, 240, 250],
          "ASSURANCE AUTO"
        ),
      ],
      TODAY
    );
    expect(out.map((d) => d.key)).toEqual(["assurance auto", "netflix"]);
    expect(out[0].annualImpact).toBeGreaterThan(out[1].annualImpact);
  });

  it("ignore tout ce qui n'est pas une dépense", () => {
    const rising = monthly(
      ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"],
      [100, 110, 120, 130, 140, 150],
      "SALAIRE"
    ).map((x) => ({ ...x, type: "income" as const, amount: -x.amount }));
    expect(merchantDrifts(rising, TODAY)).toEqual([]);
  });

  it("ne bronche pas sur un commerçant vu dans un seul mois", () => {
    // Toutes les opérations dans le même mois : une série d'un point, sur
    // laquelle aucune pente n'est calculable. Doit être écartée sans NaN ni
    // exception.
    const out = merchantDrifts(
      [t("2026-05-02", 20), t("2026-05-12", 30), t("2026-05-22", 25)],
      TODAY
    );
    expect(out).toEqual([]);
  });

  it("rend une liste vide pour une entrée vide", () => {
    expect(merchantDrifts([], TODAY)).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/cockpit/drift.test.ts`
Expected: FAIL — « Failed to resolve import "./drift" ».

- [ ] **Step 3: Écrire le module**

Créer `lib/cockpit/drift.ts` :

```ts
import type { Txn } from "./types";
import { merchantKey } from "./payee-key";

/**
 * Dérive des abonnements : quels commerçants récurrents coûtent chaque mois un
 * peu plus cher, et combien cela fait sur un an.
 *
 * Le module ne connaît ni React ni Supabase : il prend des transactions et une
 * date, et rend un classement.
 */
export type DriftPoint = { month: string; total: number };

export type Drift = {
  /** Clé commerçant, stable à travers les variantes de libellé. */
  key: string;
  /** Libellé d'affichage : le plus fréquent du groupe. */
  label: string;
  monthsSeen: number;
  /** Pente de la droite ajustée, en euros par mois. */
  slope: number;
  /** Qualité de l'ajustement, 0..1. */
  r2: number;
  /** slope × 12 : ce que la dérive coûte sur un an. */
  annualImpact: number;
  /** Médiane des 3 derniers mois observés — un montant qui s'est produit. */
  recent: number;
  series: DriftPoint[];
};

/** En dessous, une droite passe par n'importe quoi. */
export const MIN_MONTHS = 5;
/**
 * La droite doit décrire les points, pas seulement les traverser. C'est ce
 * seuil qui écarte les postes variables : leur pente est grande, leur
 * ajustement proche de zéro.
 */
export const MIN_R2 = 0.5;
/** En dessous, la ligne n'appelle aucune action. */
export const MIN_ANNUAL = 20;

/** Rang absolu d'un mois « YYYY-MM », pour mesurer les écarts en mois réels. */
function monthIndex(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return y * 12 + (m - 1);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (!n) return 0;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

/**
 * Droite des moindres carrés. Rendue totale à dessein : les appelants d'ici
 * garantissent au moins deux x distincts, mais une fonction qui rend NaN sur
 * une entrée dégénérée contaminerait silencieusement tout ce qui la consomme.
 */
function fit(points: { x: number; y: number }[]): { slope: number; r2: number } {
  const n = points.length;
  if (!n) return { slope: 0, r2: 0 };
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    sxx += (p.x - mx) * (p.x - mx);
    sxy += (p.x - mx) * (p.y - my);
    syy += (p.y - my) * (p.y - my);
  }
  if (sxx === 0) return { slope: 0, r2: 0 };
  // Variance nulle en y : la série est plate. Le R² est indéfini au sens
  // strict ; 0 est le choix qui ne ment pas, et une pente nulle est de toute
  // façon écartée par le seuil d'impact.
  return { slope: sxy / sxx, r2: syy === 0 ? 0 : (sxy * sxy) / (sxx * syy) };
}

export function merchantDrifts(txns: Txn[], today: string): Drift[] {
  const current = today.slice(0, 7);
  const groups = new Map<
    string,
    { byMonth: Map<string, number>; labels: Map<string, number> }
  >();

  for (const t of txns) {
    if (t.type !== "expense") continue;
    const month = t.date.slice(0, 7);
    // Le mois en cours est partiel : un abonnement pas encore prélevé y vaut
    // zéro et fabriquerait une chute. Les mois postérieurs, s'il en existe,
    // ne sont pas de l'historique observé et tombent par la même règle.
    if (month >= current) continue;
    const key = merchantKey(t.description);
    if (!key) continue;
    const g = groups.get(key) ?? {
      byMonth: new Map<string, number>(),
      labels: new Map<string, number>(),
    };
    g.byMonth.set(month, (g.byMonth.get(month) ?? 0) + Math.abs(Number(t.amount)));
    g.labels.set(t.description, (g.labels.get(t.description) ?? 0) + 1);
    groups.set(key, g);
  }

  const out: Drift[] = [];
  for (const [key, g] of groups) {
    const series = [...g.byMonth.entries()]
      .map(([month, total]) => ({ month, total }))
      .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
    if (series.length < MIN_MONTHS) continue;

    const base = monthIndex(series[0].month);
    const { slope, r2 } = fit(
      series.map((p) => ({ x: monthIndex(p.month) - base, y: p.total }))
    );
    const annualImpact = slope * 12;
    // Seules les hausses, et seulement celles qui valent une action.
    if (annualImpact < MIN_ANNUAL) continue;
    if (r2 <= MIN_R2) continue;

    let label = key;
    let best = -1;
    for (const [lbl, n] of g.labels) {
      if (n > best) {
        best = n;
        label = lbl;
      }
    }

    out.push({
      key,
      label,
      monthsSeen: series.length,
      slope,
      r2,
      annualImpact,
      recent: median(series.slice(-3).map((p) => p.total)),
      series,
    });
  }

  return out.sort((a, b) => b.annualImpact - a.annualImpact);
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run lib/cockpit/drift.test.ts`
Expected: PASS (13 tests).

Run: `npm run test` puis `npx tsc --noEmit`
Expected: PASS, aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/drift.ts lib/cockpit/drift.test.ts
git commit -m "feat(cockpit): subscription drift detection

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Extraire la fiche commerçant

Objectif : l'écran Dérive doit ouvrir la même fiche que l'écran Commerçants. Elle est aujourd'hui écrite en ligne dans `app/cockpit/commercants/page.tsx`. **Cette tâche ne change aucun comportement** : elle déplace du JSX et rebranche l'appelant existant.

**Files:**
- Create: `components/cockpit/MerchantSheet.tsx`
- Modify: `app/cockpit/commercants/page.tsx`

**Interfaces:**
- Consumes: `MerchantSeriesBars`, `OpsDrill` (déjà au projet), `Category` et `Txn` (`lib/cockpit/types.ts`).
- Produces : le composant

  ```ts
  function MerchantSheet(props: {
    label: string;
    lastDate?: string;
    series: { month: string; total: number }[];
    txns: Txn[];
    categories: Category[];
    query: string;
    onQuery: (q: string) => void;
    onBack: () => void;
    onBulkCategorise?: (txns: Txn[]) => void;
    onBulkDelete?: (txns: Txn[]) => void;
  }): JSX.Element
  ```

- [ ] **Step 1: Créer le composant**

Créer `components/cockpit/MerchantSheet.tsx` :

```tsx
"use client";

import { Store } from "lucide-react";
import { MerchantSeriesBars } from "@/components/cockpit/MerchantSeriesBars";
import { OpsDrill } from "@/components/cockpit/OpsDrill";
import type { Category, Txn } from "@/lib/cockpit/types";

/**
 * Fiche d'un commerçant : son évolution mensuelle et ses opérations.
 *
 * Partagée par l'écran Commerçants et l'écran Dérive. La dupliquer
 * garantirait que les deux copies divergent — c'est déjà arrivé une fois sur
 * le reclassement en masse, d'où `useBulkRecategorise`.
 */
export function MerchantSheet({
  label,
  lastDate,
  series,
  txns,
  categories,
  query,
  onQuery,
  onBack,
  onBulkCategorise,
  onBulkDelete,
}: {
  label: string;
  lastDate?: string;
  series: { month: string; total: number }[];
  txns: Txn[];
  categories: Category[];
  query: string;
  onQuery: (q: string) => void;
  onBack: () => void;
  onBulkCategorise?: (txns: Txn[]) => void;
  onBulkDelete?: (txns: Txn[]) => void;
}) {
  return (
    <>
      {lastDate && (
        <p className="text-[13px] text-ink-muted mb-2">
          Dernière opération le{" "}
          {new Date(`${lastDate}T00:00:00`).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      )}
      <MerchantSeriesBars series={series} />
      <OpsDrill
        mode="category"
        title={label}
        Icon={Store}
        txns={txns}
        categories={categories}
        query={query}
        onQuery={onQuery}
        chip={null}
        onChip={() => {}}
        onSelectTxn={() => {}}
        onBack={onBack}
        onBulkCategorise={onBulkCategorise}
        onBulkDelete={onBulkDelete}
      />
    </>
  );
}
```

- [ ] **Step 2: Rebrancher l'écran Commerçants**

Dans `app/cockpit/commercants/page.tsx`, remplacer tout le bloc entre `{selected ? (` et son `) : (` par :

```tsx
      {selected ? (
        <MerchantSheet
          label={selected.label}
          lastDate={selected.lastDate}
          series={series}
          txns={selectedTxns}
          categories={categories.filter((c) => c.active !== false)}
          query={drillQuery}
          onQuery={setDrillQuery}
          onBack={closeMerchant}
          onBulkCategorise={bulk.start}
          onBulkDelete={del.start}
        />
      ) : (
```

Ajouter l'import `import { MerchantSheet } from "@/components/cockpit/MerchantSheet";`.

Puis **retirer les imports devenus inutiles** dans ce fichier : `Store` (de `lucide-react`, mais garder `ArrowDown` et `ArrowUp`), `MerchantSeriesBars` et `OpsDrill`. Vérifier avec `npx tsc --noEmit` : un import inutilisé fait échouer le lint du build.

Le fragment `<>…</>` qui entourait la fiche disparaît avec elle ; ne pas laisser de fragment vide.

- [ ] **Step 3: Vérifier qu'aucun comportement n'a bougé**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

Run: `npm run test`
Expected: PASS, aucun test touché (ce sont des composants, non testés unitairement dans ce projet).

Run: `npm run build`
Expected: build réussi.

Relire le diff : il ne doit contenir que du déplacement. Toute différence de classe CSS, de props passées ou d'ordre de rendu est un défaut, pas une amélioration.

- [ ] **Step 4: Commit**

```bash
git add components/cockpit/MerchantSheet.tsx app/cockpit/commercants/page.tsx
git commit -m "refactor(cockpit): extract the merchant sheet for reuse

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: L'écran Dérive et son accès

**Files:**
- Create: `components/cockpit/DriftRow.tsx`
- Create: `app/cockpit/derive/page.tsx`
- Modify: `components/cockpit/CategoryBreakdown.tsx`
- Modify: `app/cockpit/page.tsx`

**Interfaces:**
- Consumes: `merchantDrifts`, `Drift` (Task 1) ; `MerchantSheet` (Task 2) ; `useAllTransactions`, `useAuth`, `useCategories`, `useRecurringCharges` (`lib/cockpit/hooks.ts`) ; `detectRecurring` (`lib/cockpit/recurring-detect.ts`) ; `merchantKey` (`lib/cockpit/payee-key.ts`) ; `merchantSeries` (`lib/cockpit/merchants.ts`) ; `createRecurringCharge`, `updateRecurringCharge` (`lib/cockpit/recurring-charges-api.ts`) ; `eur`, `todayISO`, `currentMonth` (`lib/cockpit/format.ts`).
- Produces: rien qu'une autre tâche consomme.

- [ ] **Step 1: Écrire la ligne de dérive**

Créer `components/cockpit/DriftRow.tsx` :

```tsx
"use client";

import { eur } from "@/lib/cockpit/format";
import { MerchantSeriesBars } from "@/components/cockpit/MerchantSeriesBars";
import type { Drift } from "@/lib/cockpit/drift";

/**
 * Une dérive et ce qu'on peut en faire.
 *
 * L'impact annuel est mis en avant plutôt que la pente : c'est lui qui décide
 * d'agir ou non. La pente reste affichée parce qu'elle dit à quelle vitesse
 * cela monte — mais c'est une moyenne, pas le montant de la dernière hausse.
 */
export function DriftRow({
  drift,
  actionLabel,
  onAction,
  onOpen,
  busy,
}: {
  drift: Drift;
  actionLabel: string;
  onAction: () => void;
  onOpen: () => void;
  busy: boolean;
}) {
  return (
    <div className="bg-card rounded-2xl p-4 mb-3">
      <div className="flex justify-between items-baseline gap-3 mb-0.5">
        <span className="text-[14px] font-medium truncate">{drift.label}</span>
        <span className="font-mono-num text-[15px] text-accent shrink-0">
          +{eur(drift.annualImpact)} / an
        </span>
      </div>
      <div className="text-[12.5px] text-ink-muted mb-2">
        <span className="font-mono-num">+{eur(drift.slope)}</span> par mois en
        moyenne · dernier montant{" "}
        <span className="font-mono-num">{eur(drift.recent)}</span>
      </div>
      <div
        className="text-[11.5px] text-ink-muted mb-2"
        title="Part de la variation expliquée par la tendance : plus c'est haut, plus la hausse est régulière."
      >
        {drift.monthsSeen} mois observés · régularité{" "}
        {Math.round(drift.r2 * 100)} %
      </div>

      <MerchantSeriesBars series={drift.series} />

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 bg-seg text-ink rounded-lg py-2.5 text-[13px] font-semibold"
        >
          Fiche
        </button>
        <button
          type="button"
          onClick={onAction}
          disabled={busy}
          className="flex-1 bg-emerald text-paper rounded-lg py-2.5 text-[13px] font-semibold disabled:opacity-50"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Écrire l'écran**

Créer `app/cockpit/derive/page.tsx` :

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  useAllTransactions,
  useAuth,
  useCategories,
  useRecurringCharges,
} from "@/lib/cockpit/hooks";
import { merchantDrifts } from "@/lib/cockpit/drift";
import type { Drift } from "@/lib/cockpit/drift";
import { detectRecurring } from "@/lib/cockpit/recurring-detect";
import { merchantKey } from "@/lib/cockpit/payee-key";
import { merchantSeries } from "@/lib/cockpit/merchants";
import {
  createRecurringCharge,
  updateRecurringCharge,
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
  const { txns, loading, refetch } = useAllTransactions();
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

  // Les montants attendus sont stockés en euros entiers dans toute l'app
  // (voir EngagementsModal) : arrondir ici garde les deux écrans cohérents.
  const recale = async (d: Drift) => {
    const charge = chargeByKey.get(d.key);
    if (!charge) return;
    setBusy(true);
    setNoteIsError(false);
    try {
      await updateRecurringCharge(charge.id, {
        label: charge.label,
        expectedAmount: Math.round(d.recent),
        active: true,
      });
      setNote(`${charge.label} attendu à ${eur(Math.round(d.recent))}`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Erreur");
      setNoteIsError(true);
    } finally {
      setBusy(false);
      refetchCharges();
    }
  };

  const suivre = async (d: Drift) => {
    setBusy(true);
    setNoteIsError(false);
    try {
      await createRecurringCharge(user.id, {
        payeeKey: d.key,
        label: d.label,
        expectedAmount: Math.round(d.recent),
      });
      setNote(`${d.label} suivi à ${eur(Math.round(d.recent))}`);
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

          {ready && (
            <>
              <h2 className="font-display text-[15px] mb-2">
                Engagements suivis
              </h2>
              {suivis.length ? (
                suivis.map((d) => (
                  <DriftRow
                    key={d.key}
                    drift={d}
                    actionLabel={`Recaler à ${eur(Math.round(d.recent))}`}
                    onAction={() => recale(d)}
                    onOpen={() => openSheet(d.key)}
                    busy={busy}
                  />
                ))
              ) : (
                <p className="text-ink-muted text-sm mb-5">
                  Aucun engagement suivi n&apos;a 5 mois d&apos;historique, une
                  hausse régulière et au moins 20 € d&apos;écart sur un an.
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
                    actionLabel={`Suivre à ${eur(Math.round(d.recent))}`}
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
      {del.note && (
        <p
          className={`text-[13px] mt-3 ${
            del.noteIsError ? "text-accent" : "text-emerald"
          }`}
        >
          {del.note}
        </p>
      )}
      {del.pending && (
        <ConfirmDeleteSheet
          txns={del.pending}
          busy={del.busy}
          onConfirm={del.confirm}
          onClose={del.cancel}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 3: Ouvrir l'accès depuis le Cockpit**

Dans `components/cockpit/CategoryBreakdown.tsx`, ajouter une prop `onOpenDrift: () => void` à côté de `onOpenEvolution`, et un bouton **avant** celui de « Évolution », dans le même style que ses voisins :

```tsx
          <button
            type="button"
            onClick={onOpenDrift}
            className="text-[12px] text-ink-muted"
          >
            Dérive
          </button>
```

Dans `app/cockpit/page.tsx`, passer la prop au composant, à côté des deux autres :

```tsx
            onOpenDrift={() => router.push("/cockpit/derive")}
```

- [ ] **Step 4: Vérifier**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

Run: `npm run test`
Expected: PASS, snapshots de `lib/simulator.test.ts` intacts.

Run: `npm run build`
Expected: build réussi, la route `/cockpit/derive` apparaît dans la liste.

- [ ] **Step 5: Commit**

```bash
git add components/cockpit/DriftRow.tsx app/cockpit/derive/page.tsx components/cockpit/CategoryBreakdown.tsx app/cockpit/page.tsx
git commit -m "feat(cockpit): subscription drift screen

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Smoke test manuel (à faire par l'utilisateur)**

1. `npm run dev`, ouvrir le Cockpit, cliquer « Dérive » dans l'en-tête « Par catégorie ».
2. Vérifier qu'aucune ligne de courses ou d'essence n'apparaît — si c'est le cas, c'est le R² qui n'a pas joué son rôle.
3. Sur une ligne suivie, « Recaler » : rouvrir la modale des engagements et vérifier que le montant attendu a changé.
4. Sur une ligne non suivie, « Suivre » : elle doit passer dans la première section après rechargement.
5. « Fiche » : la même fiche que dans l'écran Commerçants, sélection multiple et suppression comprises.

---

## Notes d'exécution

- **Ordre contraignant** : Task 1, puis Task 2, puis Task 3. La Task 3 consomme les deux précédentes.
- **Ne jamais lancer vitest avec `--update`** : `lib/simulator.test.ts` contient des snapshots de caractérisation d'un autre chantier.
- Aucune migration SQL dans ce chantier.
- La Task 2 est un déplacement pur : un diff qui change autre chose que l'emplacement du code est un défaut.
- `lib/cockpit/drift.ts` ne connaît ni React, ni Supabase, ni catégories. Si une tâche a besoin d'y importer l'un des trois, c'est que le calcul est au mauvais endroit.
