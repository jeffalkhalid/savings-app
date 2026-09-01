# Analyse par commerçant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un écran qui classe les commerçants par montant cumulé sur tout l'historique, avec une fiche par commerçant d'où l'on peut reclasser ses opérations en masse — et des totaux justes, c'est-à-dire calculés sur toutes les transactions et non sur les 1000 premières.

**Architecture :** un correctif de pagination sur le hook qui lit les transactions (prérequis bloquant), puis un module pur d'agrégation par clé commerçant, puis un écran qui réutilise le drill existant pour la fiche — ce qui lui donne gratuitement la recherche, les libellés dépliables et la sélection en masse.

**Tech Stack :** Next.js 15 (App Router), React 19, TypeScript, Tailwind 3, Supabase, Vitest 4, lucide-react.

**Spec :** `docs/superpowers/specs/2026-09-01-analyse-par-commercant-design.md`

## Global Constraints

- Le français est la langue de toute l'UI et des messages d'erreur affichés, accord du pluriel compris.
- Icônes : **lucide-react** uniquement, jamais d'emoji.
- Montants et valeurs numériques en `.font-mono-num` ; tokens Boussole (`text-ink`, `text-ink-muted`, `bg-card`, `bg-paper`, `bg-tile`, `border-rule`, `text-accent`, `bg-seg`, `bg-emerald`, `text-strat-a`).
- Les modules `lib/` restent purs (aucun import React, aucun accès réseau) sauf `*-api.ts` et `hooks.ts`.
- Aucune migration SQL dans ce chantier : il n'y a ni nouvelle table ni nouvelle vue.
- Commits en anglais, format `type(scope): message`, avec la ligne `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Tests : `npm run test` (Vitest 4). Vérification finale : `npx tsc --noEmit` puis `npm run build`.
- **Ne jamais lancer vitest avec `--update` ou `-u`** : `lib/simulator.test.ts` contient des snapshots de caractérisation d'un autre chantier.

---

### Task 1: Paginer la lecture des transactions

Prérequis bloquant. `useAllTransactions` lit sans `range()`, sans `limit()` et sans `order()` ;
Supabase plafonne à 1000 lignes, et sans tri on ne sait pas lesquelles reviennent. L'utilisateur a
996 lignes importées plus son historique antérieur : le plafond est déjà atteint. Sans ce
correctif, tout l'écran de cette fonctionnalité afficherait des totaux faux, en silence.

Ce hook alimente aussi `buildHistoryMap` (apprentissage des catégories à l'import) et
`detectRecurring` (détection des engagements) — cette tâche les répare au passage.

**Files:**
- Create: `lib/cockpit/paging.ts`
- Test: `lib/cockpit/paging.test.ts`
- Modify: `lib/cockpit/hooks.ts` (`useAllTransactions`)

**Interfaces:**
- Consumes: rien.
- Produces:
  - `function pageRanges(total: number, size: number): { from: number; to: number }[]` — utilitaire pur, testé, qui sert à raisonner et tester le découpage.
  - `useAllTransactions()` renvoie désormais `{ txns, loading, error, refetch }` — le `refetch` est **nécessaire** : après un reclassement en masse depuis la fiche commerçant, sans lui l'écran continuerait d'afficher les anciennes catégories.

- [ ] **Step 1: Écrire les tests du découpage en plages**

Créer `lib/cockpit/paging.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { pageRanges } from "./paging";

describe("pageRanges", () => {
  it("découpe en plages inclusives, comme Supabase les attend", () => {
    expect(pageRanges(2500, 1000)).toEqual([
      { from: 0, to: 999 },
      { from: 1000, to: 1999 },
      { from: 2000, to: 2499 },
    ]);
  });

  it("rend une seule plage quand tout tient dedans", () => {
    expect(pageRanges(10, 1000)).toEqual([{ from: 0, to: 9 }]);
  });

  it("gère un total exactement multiple de la taille de page", () => {
    expect(pageRanges(2000, 1000)).toEqual([
      { from: 0, to: 999 },
      { from: 1000, to: 1999 },
    ]);
  });

  it("rend une liste vide pour un total nul", () => {
    expect(pageRanges(0, 1000)).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/cockpit/paging.test.ts`
Expected: FAIL — « Failed to resolve import "./paging" ».

- [ ] **Step 3: Écrire le module**

Créer `lib/cockpit/paging.ts` :

```ts
/** Taille de page : Supabase plafonne les réponses à 1000 lignes par défaut. */
export const PAGE_SIZE = 1000;

/**
 * Découpe un total en plages `from`/`to` **inclusives**, la convention de
 * `.range()` côté Supabase.
 */
export function pageRanges(
  total: number,
  size: number
): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  for (let from = 0; from < total; from += size) {
    out.push({ from, to: Math.min(from + size, total) - 1 });
  }
  return out;
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run lib/cockpit/paging.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Paginer `useAllTransactions`**

Dans `lib/cockpit/hooks.ts`, ajouter l'import :

```ts
import { PAGE_SIZE } from "./paging";
```

et remplacer intégralement le corps de `useAllTransactions` par :

```ts
export function useAllTransactions() {
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // `tick` sert uniquement à relancer l'effet sur demande.
  const [tick, setTick] = useState(0);
  const refetch = useCallback(() => {
    setLoading(true);
    setTick((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Supabase plafonne une réponse à 1000 lignes. On pagine jusqu'à recevoir
    // une page incomplète : sans cela l'historique est tronqué en silence, et
    // tout ce qui s'appuie dessus (analyse par commerçant, apprentissage des
    // catégories, détection des engagements) travaille sur un échantillon.
    // L'`order` rend la pagination déterministe : sans tri, deux pages
    // successives peuvent se recouvrir ou se manquer.
    const run = async () => {
      const all: Txn[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from("transactions")
          .select("id,date,amount,type,description,category_id")
          .order("date", { ascending: true })
          .order("id", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (error) {
          if (!cancelled) {
            setError(error.message);
            setLoading(false);
          }
          return;
        }
        const page = (data as Txn[]) ?? [];
        all.push(...page);
        if (page.length < PAGE_SIZE) break;
      }
      if (!cancelled) {
        setError(null);
        setTxns(all);
        setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { txns, loading, error, refetch };
}
```

Note : le second tri sur `id` départage les transactions de même date. Sans lui, l'ordre des
ex æquo n'est pas garanti d'une requête à l'autre et une ligne pourrait être vue deux fois ou
jamais.

- [ ] **Step 6: Vérifier**

Run: `npm run test`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: aucune erreur.

Run: `npm run build`
Expected: build réussi.

- [ ] **Step 7: Commit**

```bash
git add lib/cockpit/paging.ts lib/cockpit/paging.test.ts lib/cockpit/hooks.ts
git commit -m "fix(cockpit): paginate the full transaction read

Supabase caps a response at 1000 rows and the query had no range, limit or
order, so the history was silently truncated — and non-deterministically,
since without an order the returned subset is arbitrary. Merchant analysis,
category learning at import and recurring-charge detection all read through
this hook.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Module d'agrégation `merchants.ts`

**Files:**
- Create: `lib/cockpit/merchants.ts`
- Test: `lib/cockpit/merchants.test.ts`

**Interfaces:**
- Consumes: `merchantKey` (`lib/cockpit/payee-key.ts`), `Txn` (`lib/cockpit/types.ts`).
- Produces:
  - `type MerchantStat = { key: string; label: string; total: number; count: number; lastDate: string }`
  - `function aggregateByMerchant(txns: Txn[]): MerchantStat[]`
  - `function merchantSeries(txns: Txn[], key: string): { month: string; total: number }[]`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `lib/cockpit/merchants.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { aggregateByMerchant, merchantSeries } from "./merchants";
import type { Txn } from "./types";

const t = (
  id: string,
  date: string,
  amount: number,
  description: string
): Txn => ({ id, date, amount, description, type: "expense" });

const ELIOR_A =
  "FACTURE CARTE DU 050825 ELIOR ENTRETRIS CARTE   4974XXXXXXXX4402                FRA    20,00EUR";
const ELIOR_B =
  "FACTURE CARTE DU 120925 ELIOR ENTRETRIS CARTE   4974XXXXXXXX4402                FRA    12,50EUR";
const UBER =
  "FACTURE CARTE DU 010825 UBER TRIP CARTE   4974XXXXXXXX4402                NLD    18,00EUR";

describe("aggregateByMerchant", () => {
  it("regroupe par commerçant et somme en valeur absolue", () => {
    const out = aggregateByMerchant([
      t("1", "2026-08-05", -20, ELIOR_A),
      t("2", "2026-09-12", -12.5, ELIOR_B),
      t("3", "2026-08-01", -18, UBER),
    ]);
    const elior = out.find((m) => m.key === "elior entretris");
    expect(elior?.total).toBeCloseTo(32.5);
    expect(elior?.count).toBe(2);
  });

  it("trie par montant cumulé décroissant", () => {
    const out = aggregateByMerchant([
      t("1", "2026-08-01", -18, UBER),
      t("2", "2026-08-05", -20, ELIOR_A),
      t("3", "2026-09-12", -12.5, ELIOR_B),
    ]);
    expect(out.map((m) => m.key)).toEqual(["elior entretris", "uber trip"]);
  });

  it("retient la date la plus récente du groupe", () => {
    const out = aggregateByMerchant([
      t("1", "2026-08-05", -20, ELIOR_A),
      t("2", "2026-09-12", -12.5, ELIOR_B),
    ]);
    expect(out[0].lastDate).toBe("2026-09-12");
  });

  it("affiche le libellé le plus fréquent du groupe", () => {
    const out = aggregateByMerchant([
      t("1", "2026-08-05", -20, ELIOR_A),
      t("2", "2026-08-06", -20, ELIOR_A),
      t("3", "2026-09-12", -12.5, ELIOR_B),
    ]);
    expect(out[0].label).toBe(ELIOR_A);
  });

  it("ignore les libellés qui ne produisent aucune clé", () => {
    expect(aggregateByMerchant([t("1", "2026-08-05", -20, "")])).toEqual([]);
  });

  it("rend une liste vide pour une entrée vide", () => {
    expect(aggregateByMerchant([])).toEqual([]);
  });

  it("somme aussi les montants positifs, en valeur absolue", () => {
    const out = aggregateByMerchant([
      t("1", "2026-08-05", 2795.12, "VIR SEPA RECU /DE CARREFOUR FRANCE /MOTIF  /REF X"),
    ]);
    expect(out[0].key).toBe("carrefour france");
    expect(out[0].total).toBeCloseTo(2795.12);
  });
});

describe("merchantSeries", () => {
  it("rend les totaux mensuels par ordre croissant", () => {
    const out = merchantSeries(
      [
        t("1", "2026-09-12", -12.5, ELIOR_B),
        t("2", "2026-08-05", -20, ELIOR_A),
        t("3", "2026-08-06", -10, ELIOR_A),
      ],
      "elior entretris"
    );
    expect(out).toEqual([
      { month: "2026-08", total: 30 },
      { month: "2026-09", total: 12.5 },
    ]);
  });

  it("n'invente pas les mois sans opération", () => {
    const out = merchantSeries(
      [
        t("1", "2026-08-05", -20, ELIOR_A),
        t("2", "2026-10-05", -20, ELIOR_A),
      ],
      "elior entretris"
    );
    expect(out.map((p) => p.month)).toEqual(["2026-08", "2026-10"]);
  });

  it("rend une série vide pour un commerçant inconnu", () => {
    expect(merchantSeries([t("1", "2026-08-05", -20, ELIOR_A)], "inconnu")).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/cockpit/merchants.test.ts`
Expected: FAIL — « Failed to resolve import "./merchants" ».

- [ ] **Step 3: Écrire le module**

Créer `lib/cockpit/merchants.ts` :

```ts
import type { Txn } from "./types";
import { merchantKey } from "./payee-key";

export type MerchantStat = {
  /** Clé commerçant, stable à travers les variantes de libellé. */
  key: string;
  /** Libellé d'affichage : le plus fréquent du groupe. */
  label: string;
  /** Somme des montants en valeur absolue. */
  total: number;
  count: number;
  /** Date la plus récente du groupe, ISO. */
  lastDate: string;
};

/**
 * Classe les commerçants par volume.
 *
 * Les montants sont sommés en **valeur absolue** : la question posée est
 * « quel volume passe par là », pas « quel est le solde ». Un même commerçant
 * peut d'ailleurs porter des flux dans les deux sens.
 */
export function aggregateByMerchant(txns: Txn[]): MerchantStat[] {
  const groups = new Map<
    string,
    { total: number; count: number; lastDate: string; labels: Map<string, number> }
  >();

  for (const t of txns) {
    const key = merchantKey(t.description);
    if (!key) continue;
    const g =
      groups.get(key) ??
      { total: 0, count: 0, lastDate: "", labels: new Map<string, number>() };
    g.total += Math.abs(Number(t.amount));
    g.count += 1;
    if (t.date > g.lastDate) g.lastDate = t.date;
    g.labels.set(t.description, (g.labels.get(t.description) ?? 0) + 1);
    groups.set(key, g);
  }

  const out: MerchantStat[] = [];
  for (const [key, g] of groups) {
    let label = key;
    let best = -1;
    for (const [lbl, n] of g.labels) {
      if (n > best) {
        best = n;
        label = lbl;
      }
    }
    out.push({ key, label, total: g.total, count: g.count, lastDate: g.lastDate });
  }
  return out.sort((a, b) => b.total - a.total);
}

/**
 * Totaux mensuels d'un commerçant, mois croissants. Un mois sans opération est
 * absent de la série plutôt que présent à zéro : on n'invente pas de donnée.
 */
export function merchantSeries(
  txns: Txn[],
  key: string
): { month: string; total: number }[] {
  const byMonth = new Map<string, number>();
  for (const t of txns) {
    if (merchantKey(t.description) !== key) continue;
    const m = t.date.slice(0, 7);
    byMonth.set(m, (byMonth.get(m) ?? 0) + Math.abs(Number(t.amount)));
  }
  return [...byMonth.entries()]
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run lib/cockpit/merchants.test.ts`
Expected: PASS (10 tests).

Run: `npm run test` puis `npx tsc --noEmit`
Expected: PASS, aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/merchants.ts lib/cockpit/merchants.test.ts
git commit -m "feat(analyse): aggregate transactions by merchant

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Extraire le reclassement en masse dans un hook partagé

La fiche commerçant a besoin exactement du comportement que `app/cockpit/page.tsx` implémente
aujourd'hui en ligne. Le recopier ferait diverger deux chemins d'écriture qui doivent rester
identiques — c'est là qu'on avait déjà oublié la remise à zéro de `goal_id`.

**Files:**
- Create: `lib/cockpit/use-bulk-recategorise.ts`
- Modify: `app/cockpit/page.tsx`

**Interfaces:**
- Consumes: `updateTransactionsCategory`, `setCategoryRules`, `rulesFromTxns`, `bulkSummary`, `Category`, `Txn`.
- Produces:
  - `function useBulkRecategorise(userId: string, onDone: () => void)` renvoyant
    `{ pending: Txn[] | null, note: string, noteIsError: boolean, start: (txns: Txn[]) => void, cancel: () => void, apply: (categoryName: string, categories: Category[]) => Promise<void> }`.

- [ ] **Step 1: Écrire le hook**

Créer `lib/cockpit/use-bulk-recategorise.ts` :

```ts
"use client";

import { useState } from "react";
import type { Category, Txn } from "./types";
import { updateTransactionsCategory } from "./transactions-api";
import { setCategoryRules } from "./category-rules-api";
import { rulesFromTxns, bulkSummary } from "./bulk-select";

/**
 * Reclassement en masse, partagé par le Cockpit et la fiche commerçant.
 *
 * `onDone` est appelé après chaque tentative, réussie ou non : la base a pu
 * changer même sur le chemin d'erreur, donc l'appelant doit recharger.
 */
export function useBulkRecategorise(userId: string, onDone: () => void) {
  const [pending, setPending] = useState<Txn[] | null>(null);
  const [note, setNote] = useState("");
  const [noteIsError, setNoteIsError] = useState(false);

  const apply = async (categoryName: string, categories: Category[]) => {
    const picked = pending ?? [];
    const cat = categories.find((c) => c.name === categoryName);
    setPending(null);
    if (!cat || !picked.length) return;
    setNoteIsError(false);
    let moved = false;
    try {
      await updateTransactionsCategory(
        picked.map((t) => t.id),
        cat.id,
        cat.type
      );
      moved = true;
      const newRules = rulesFromTxns(picked, cat.id);
      await setCategoryRules(userId, newRules);
      setNote(bulkSummary(picked.length, newRules.length, cat.name));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      // Distinguer les deux échecs : si les opérations sont déjà reclassées,
      // le dire, sinon l'utilisateur croit que rien n'a bougé et recommence.
      setNote(
        moved
          ? `Opérations reclassées, mais la règle n'a pas pu être enregistrée : ${msg}`
          : msg
      );
      setNoteIsError(true);
    } finally {
      onDone();
    }
  };

  return {
    pending,
    note,
    noteIsError,
    start: (txns: Txn[]) => setPending(txns),
    cancel: () => setPending(null),
    apply,
  };
}
```

Note : ce fichier vit dans `lib/cockpit/` mais porte `"use client"` et importe React — comme
`hooks.ts`, qui fait de même. La contrainte de pureté des modules `lib/` exempte explicitement
`hooks.ts` et les `*-api.ts` ; ce hook relève de la même exception.

- [ ] **Step 2: Remplacer l'implémentation en ligne du Cockpit**

Dans `app/cockpit/page.tsx` :

- supprimer les états `bulkTxns`, `bulkNote`, `bulkNoteError` et la fonction `applyBulkCategory` ;
- supprimer les imports devenus inutiles : `rulesFromTxns`, `bulkSummary`,
  `updateTransactionsCategory`, `setCategoryRules` (vérifier qu'ils ne servent nulle part ailleurs
  dans le fichier avant de retirer chacun) ;
- ajouter `import { useBulkRecategorise } from "@/lib/cockpit/use-bulk-recategorise";` ;
- déclarer, à côté des autres hooks :

```ts
  const bulk = useBulkRecategorise(user.id, refetch);
```

- remplacer `onBulkCategorise={(sel) => setBulkTxns(sel)}` par
  `onBulkCategorise={bulk.start}` ;
- remplacer le bloc de la note par :

```tsx
      {bulk.note && (
        <p
          className={`text-[13px] mb-3 ${
            bulk.noteIsError ? "text-accent" : "text-emerald"
          }`}
        >
          {bulk.note}
        </p>
      )}
```

- remplacer le bloc de la feuille par :

```tsx
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
```

- [ ] **Step 3: Vérifier que le comportement du Cockpit est inchangé**

Run: `npx tsc --noEmit`
Expected: aucune erreur. En particulier, aucun symbole supprimé ne doit rester référencé.

Run: `npm run test` puis `npm run build`
Expected: PASS, build réussi.

- [ ] **Step 4: Commit**

```bash
git add lib/cockpit/use-bulk-recategorise.ts app/cockpit/page.tsx
git commit -m "refactor(cockpit): extract bulk recategorisation into a shared hook

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Écran commerçants et fiche

**Files:**
- Create: `app/cockpit/commercants/page.tsx`
- Create: `components/cockpit/MerchantList.tsx`
- Create: `components/cockpit/MerchantSeriesBars.tsx`
- Modify: `components/cockpit/CategoryBreakdown.tsx`
- Modify: `app/cockpit/page.tsx`

**Interfaces:**
- Consumes: `aggregateByMerchant`, `merchantSeries`, `MerchantStat` (Task 2) ; `useBulkRecategorise` (Task 3) ; `useAllTransactions` paginé (Task 1) ; `OpsDrill`, `CategoryPickerSheet`, `useCategories`, `useAuth` (existants).
- Produces: rien.

- [ ] **Step 1: Barres d'évolution**

Créer `components/cockpit/MerchantSeriesBars.tsx` :

```tsx
"use client";

import { eur } from "@/lib/cockpit/format";

/**
 * Évolution mensuelle en barres CSS. Une quinzaine de points au plus : une
 * bibliothèque de graphiques serait disproportionnée ici.
 */
export function MerchantSeriesBars({
  series,
}: {
  series: { month: string; total: number }[];
}) {
  if (series.length < 2) return null;
  const max = Math.max(...series.map((p) => p.total));
  const shortMonth = (m: string) =>
    new Date(`${m}-01T00:00:00`).toLocaleDateString("fr-FR", { month: "short" });

  return (
    <div className="bg-card rounded-xl p-3 mb-4">
      <div className="text-[11px] uppercase tracking-wide text-ink-muted mb-2">
        Par mois
      </div>
      <div className="flex items-end gap-1 h-20">
        {series.map((p) => (
          <div key={p.month} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full bg-accent rounded-sm"
              style={{ height: `${max > 0 ? (p.total / max) * 100 : 0}%` }}
              title={`${shortMonth(p.month)} · ${eur(p.total)}`}
            />
            <span className="text-[9px] text-ink-muted">{shortMonth(p.month)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Liste des commerçants**

Créer `components/cockpit/MerchantList.tsx` :

```tsx
"use client";

import { eur } from "@/lib/cockpit/format";
import type { MerchantStat } from "@/lib/cockpit/merchants";
import { SearchX } from "lucide-react";

export function MerchantList({
  merchants,
  onSelect,
}: {
  merchants: MerchantStat[];
  onSelect: (key: string) => void;
}) {
  if (!merchants.length) {
    return (
      <div className="text-center py-8 text-ink-muted">
        <SearchX size={28} className="mx-auto mb-1.5" />
        <div className="text-sm font-semibold text-ink">Aucun commerçant</div>
        <div className="text-xs mt-0.5">Essaie un autre mot ou un autre type.</div>
      </div>
    );
  }

  return (
    <div>
      {merchants.map((m) => (
        <button
          key={m.key}
          type="button"
          onClick={() => onSelect(m.key)}
          className="w-full text-left flex justify-between items-center gap-2.5 py-2.5 border-b border-rule"
        >
          <div className="min-w-0">
            <div className="text-sm truncate">{m.label}</div>
            <div className="text-[11.5px] text-ink-muted mt-0.5">
              {m.count} opération{m.count > 1 ? "s" : ""}
            </div>
          </div>
          <span className="font-mono-num text-sm shrink-0 text-ink">
            {eur(m.total)}
          </span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: La page**

Créer `app/cockpit/commercants/page.tsx` :

```tsx
"use client";

import { useMemo, useState } from "react";
import { Store } from "lucide-react";
import Link from "next/link";
import { useAllTransactions, useAuth, useCategories } from "@/lib/cockpit/hooks";
import { aggregateByMerchant, merchantSeries } from "@/lib/cockpit/merchants";
import { merchantKey } from "@/lib/cockpit/payee-key";
import { useBulkRecategorise } from "@/lib/cockpit/use-bulk-recategorise";
import { MerchantList } from "@/components/cockpit/MerchantList";
import { MerchantSeriesBars } from "@/components/cockpit/MerchantSeriesBars";
import { CategoryPickerSheet } from "@/components/cockpit/CategoryPickerSheet";
import { OpsDrill } from "@/components/cockpit/OpsDrill";
import { eur } from "@/lib/cockpit/format";
import type { TxnType } from "@/lib/cockpit/types";

const TYPES: { v: TxnType | "all"; label: string }[] = [
  { v: "all", label: "Tout" },
  { v: "expense", label: "Dépenses" },
  { v: "transfer", label: "Virements" },
  { v: "savings", label: "Épargne" },
  { v: "income", label: "Revenus" },
];

export default function CommercantsPage() {
  const user = useAuth();
  const { txns, loading, refetch } = useAllTransactions();
  const { categories } = useCategories();
  const [type, setType] = useState<TxnType | "all">("all");
  const [query, setQuery] = useState("");
  const [drillQuery, setDrillQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const scoped = useMemo(
    () => (type === "all" ? txns : txns.filter((t) => t.type === type)),
    [txns, type]
  );
  const merchants = useMemo(() => aggregateByMerchant(scoped), [scoped]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? merchants.filter((m) => m.label.toLowerCase().includes(q))
      : merchants;
  }, [merchants, query]);
  const total = useMemo(
    () => shown.reduce((a, m) => a + m.total, 0),
    [shown]
  );

  const selected = merchants.find((m) => m.key === selectedKey) ?? null;
  const selectedTxns = useMemo(
    () =>
      selectedKey
        ? scoped.filter((t) => merchantKey(t.description) === selectedKey)
        : [],
    [scoped, selectedKey]
  );
  const series = useMemo(
    () => (selectedKey ? merchantSeries(scoped, selectedKey) : []),
    [scoped, selectedKey]
  );

  // Recharger après un reclassement : sans cela la liste garde les anciennes
  // catégories et les totaux ne bougent pas.
  const bulk = useBulkRecategorise(user.id, refetch);

  const chipCls = (active: boolean) =>
    `shrink-0 rounded-full px-3 py-1.5 text-[12px] ${
      active ? "bg-accent text-[#FBF3EC]" : "bg-seg text-ink-muted"
    }`;

  return (
    <main className="max-w-[600px] mx-auto px-5 pt-8 pb-24">
      {selected ? (
        <>
          <MerchantSeriesBars series={series} />
          <OpsDrill
            mode="all"
            title={selected.label}
            Icon={Store}
            txns={selectedTxns}
            categories={categories.filter((c) => c.active !== false)}
            query={drillQuery}
            onQuery={setDrillQuery}
            chip={null}
            onChip={() => {}}
            onSelectTxn={() => {}}
            onBack={() => setSelectedKey(null)}
            onBulkCategorise={bulk.start}
          />
        </>
      ) : (
        <>
          <header className="mb-4">
            <Link href="/cockpit" className="text-ink-muted text-sm">
              ‹ Cockpit
            </Link>
            <h1 className="font-display text-2xl mt-2">Commerçants</h1>
            <p className="text-[13px] text-ink-muted mt-1">
              {loading
                ? "Chargement…"
                : `${shown.length} commerçant${shown.length > 1 ? "s" : ""} · ${eur(total)}`}
            </p>
          </header>

          <div className="flex gap-2 overflow-x-auto pb-2.5 mb-2">
            {TYPES.map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setType(o.v)}
                className={chipCls(type === o.v)}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-card rounded-xl px-3.5 mb-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un commerçant…"
              className="flex-1 bg-transparent outline-none text-sm py-3 text-ink"
            />
          </div>

          <MerchantList merchants={shown} onSelect={setSelectedKey} />
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
    </main>
  );
}
```

- [ ] **Step 4: Le lien d'accès depuis le Cockpit**

Dans `components/cockpit/CategoryBreakdown.tsx`, l'en-tête contient déjà un bouton « Budgets ».
Ajouter une prop `onOpenMerchants: () => void` au composant et, à côté du bouton existant, dans le
même conteneur `flex justify-between items-baseline` :

```tsx
        <div className="flex items-baseline gap-3">
          <button
            type="button"
            onClick={onOpenMerchants}
            className="text-[12px] text-ink-muted"
          >
            Commerçants
          </button>
          <button
            type="button"
            onClick={onEditBudgets}
            className="text-[12px] text-ink-muted"
          >
            Budgets
          </button>
        </div>
```

en remplaçant le bouton « Budgets » isolé par ce conteneur, de sorte que les deux liens soient
groupés à droite du titre « Par catégorie ».

Dans `app/cockpit/page.tsx`, passer la nouvelle prop au composant :

```tsx
          onOpenMerchants={() => router.push("/cockpit/commercants")}
```

`router` vient de `useRouter()` — vérifier qu'il est déjà présent dans le fichier ; s'il ne l'est
pas, ajouter `import { useRouter } from "next/navigation";` et `const router = useRouter();`, et
le signaler dans le rapport.

- [ ] **Step 5: Vérifier**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

Run: `npm run test`
Expected: PASS, snapshots de `lib/simulator.test.ts` intacts.

Run: `npm run build`
Expected: build réussi, avec la route `/cockpit/commercants` dans la liste.

- [ ] **Step 6: Commit**

```bash
git add app/cockpit/commercants components/cockpit/MerchantList.tsx components/cockpit/MerchantSeriesBars.tsx components/cockpit/CategoryBreakdown.tsx app/cockpit/page.tsx
git commit -m "feat(analyse): merchant ranking screen with per-merchant sheet

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Smoke test manuel (à faire par l'utilisateur)**

1. `npm run dev`, Cockpit → « Commerçants » dans l'en-tête « Par catégorie ».
2. Vérifier que le nombre de commerçants et le total sont plausibles au regard de l'historique
   complet — c'est le contrôle que la pagination fonctionne.
3. Filtrer sur « Dépenses » : le salaire et les virements disparaissent du classement.
4. Ouvrir un gros commerçant, vérifier les barres mensuelles, puis « Sélectionner » → « Tout
   sélectionner » → choisir une catégorie, et vérifier le message « N opérations reclassées en X,
   M règles créées ».

---

## Notes d'exécution

- **Ordre contraignant** : Task 1 avant tout le reste — sans la pagination, l'écran afficherait des
  totaux faux et le smoke test ne prouverait rien. Task 2 avant 4. Task 3 avant 4.
- **Ne jamais lancer vitest avec `--update`** : `lib/simulator.test.ts` contient des snapshots de
  caractérisation d'un autre chantier.
- Aucune migration SQL dans ce chantier.
- La Task 3 est un refactor à comportement constant : si un test ou le build change de résultat,
  c'est une régression, pas un effet attendu.
