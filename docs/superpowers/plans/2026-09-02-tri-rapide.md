# Tri rapide — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un écran qui présente les commerçants non classés un par un, du plus lourd au plus léger, pour vider « Autres » en une session au lieu de treize passages mensuels.

**Architecture :** un module pur construit la file (commerçants ayant au moins une ligne non classée et aucune règle) et calcule la suggestion ; un écran traite un commerçant à la fois et réutilise le chemin d'écriture de la sélection multiple, sans en créer un second.

**Tech Stack :** Next.js 15 (App Router), React 19, TypeScript, Tailwind 3, Supabase, Vitest 4, lucide-react.

**Spec :** `docs/superpowers/specs/2026-09-02-tri-rapide-design.md`

## Global Constraints

- Le français est la langue de toute l'UI et des messages affichés, accord du pluriel compris.
- Icônes : **lucide-react** uniquement, jamais d'emoji.
- Montants et valeurs numériques en `.font-mono-num` ; tokens Boussole (`text-ink`, `text-ink-muted`, `bg-card`, `bg-paper`, `bg-tile`, `border-rule`, `text-accent`, `bg-seg`, `bg-emerald`, `text-strat-a`).
- Les modules `lib/` restent purs (aucun import React, aucun accès réseau) sauf `*-api.ts`, `hooks.ts` et `use-*.ts`.
- Aucune migration SQL dans ce chantier : ni table, ni vue, ni colonne. `category_rules` porte déjà la mémoire du « j'ai tranché ».
- Commits en anglais, format `type(scope): message`, avec la ligne `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Tests : `npm run test` (Vitest 4). Vérification finale : `npx tsc --noEmit` puis `npm run build`.
- **Ne jamais lancer vitest avec `--update` ou `-u`** : `lib/simulator.test.ts` contient des snapshots de caractérisation d'un autre chantier.
- **Un seul chemin d'écriture.** Le tri passe par `updateTransactionsCategory` + `setCategoryRules`, comme la sélection multiple. Écrire directement dans Supabase depuis l'écran ferait diverger le tri du reste de l'app — et perdrait au passage la mise à jour du `type` et le détachement de l'objectif d'épargne.
- **Les lignes déjà classées dans une vraie catégorie ne sont jamais touchées.**

---

### Task 1: Module `triage.ts`

**Files:**
- Create: `lib/cockpit/triage.ts`
- Test: `lib/cockpit/triage.test.ts`

**Interfaces:**
- Consumes: `Txn` (`lib/cockpit/types.ts`), `merchantKey` (`lib/cockpit/payee-key.ts`).
- Produces:
  - `type TriageMerchant = { key: string; label: string; count: number; total: number; firstDate: string; lastDate: string; samples: string[]; suggestion: string | null }`
  - `function triageQueue(input: { txns: Txn[]; categoryNameById: Map<string, string>; ruledKeys: Set<string>; fallbackName?: string }): TriageMerchant[]`
  - `function frequentCategories(txns: Txn[], categoryNameById: Map<string, string>, n: number, fallbackName?: string): string[]`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `lib/cockpit/triage.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { triageQueue, frequentCategories } from "./triage";
import type { Txn } from "./types";

let seq = 0;
const t = (
  description: string,
  amount: number,
  category_id: string | null = null,
  date = "2026-05-05",
  type: Txn["type"] = "expense"
): Txn => ({
  id: `t${seq++}`,
  date,
  amount,
  description,
  type,
  category_id,
});

const NAMES = new Map([
  ["cat-autres", "Autres"],
  ["cat-courses", "Courses alimentaires"],
  ["cat-resto", "Restaurants & Sorties"],
  ["cat-vir-recus", "Virements reçus"],
  ["cat-vir-emis", "Virements émis"],
  ["cat-frais", "Frais bancaires"],
]);

const queue = (txns: Txn[], ruled: string[] = []) =>
  triageQueue({
    txns,
    categoryNameById: NAMES,
    ruledKeys: new Set(ruled),
  });

describe("triageQueue — ce qui entre dans la file", () => {
  it("retient une ligne sans catégorie", () => {
    const out = queue([t("MONOPRIX PARIS", -20)]);
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe("monoprix paris");
    expect(out[0].count).toBe(1);
  });

  it("retient une ligne rangée dans le repli « Autres »", () => {
    const out = queue([t("MONOPRIX PARIS", -20, "cat-autres")]);
    expect(out).toHaveLength(1);
  });

  it("retient une ligne dont la catégorie n'existe plus", () => {
    // Une catégorie supprimée laisse un category_id orphelin : la ligne n'est
    // plus classée, même si le champ n'est pas nul.
    const out = queue([t("MONOPRIX PARIS", -20, "cat-disparue")]);
    expect(out).toHaveLength(1);
  });

  it("écarte une ligne rangée dans une vraie catégorie", () => {
    expect(queue([t("MONOPRIX PARIS", -20, "cat-courses")])).toEqual([]);
  });

  it("écarte un commerçant couvert par une règle, même s'il est en Autres", () => {
    // La règle est la mémoire du « j'ai tranché » : c'est ce qui permet de
    // faire taire définitivement un commerçant qui relève vraiment d'Autres.
    const out = queue(
      [t("MONOPRIX PARIS", -20, "cat-autres")],
      ["monoprix paris"]
    );
    expect(out).toEqual([]);
  });

  it("écarte un libellé qui ne produit aucune clé", () => {
    expect(queue([t("", -20)])).toEqual([]);
  });

  it("rend une liste vide pour une entrée vide", () => {
    expect(queue([])).toEqual([]);
  });
});

describe("triageQueue — ce que porte une entrée", () => {
  it("ne compte que les lignes non classées d'un commerçant partiellement classé", () => {
    const out = queue([
      t("MONOPRIX PARIS", -10, "cat-courses"),
      t("MONOPRIX PARIS", -20, "cat-autres"),
      t("MONOPRIX PARIS", -30, null),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(2);
    expect(out[0].total).toBeCloseTo(50);
  });

  it("somme en valeur absolue", () => {
    const out = queue([t("REMBOURSEMENT X", 40), t("REMBOURSEMENT X", -10)]);
    expect(out[0].total).toBeCloseTo(50);
  });

  it("rend la période couverte par les lignes non classées", () => {
    const out = queue([
      t("MONOPRIX PARIS", -10, null, "2026-03-02"),
      t("MONOPRIX PARIS", -10, null, "2026-07-19"),
      t("MONOPRIX PARIS", -10, null, "2026-05-05"),
    ]);
    expect(out[0].firstDate).toBe("2026-03-02");
    expect(out[0].lastDate).toBe("2026-07-19");
  });

  it("prend pour libellé le plus fréquent du groupe", () => {
    const out = queue([
      t("MONOPRIX PARIS 14", -10),
      t("MONOPRIX PARIS 14", -10),
      t("MONOPRIX PARIS", -10),
    ]);
    expect(out[0].label).toBe("MONOPRIX PARIS 14");
  });

  it("rend jusqu'à quatre libellés distincts en exemple", () => {
    // Les exemples servent à repérer un regroupement abusif avant de classer
    // vingt lignes d'un coup : ils doivent être distincts.
    // Les suffixes sont des CHIFFRES : `normalizePayee` les retire, donc ces
    // six libellés partagent la clé « monoprix ». Avec des lettres, ils
    // formeraient six commerçants distincts.
    const out = queue([
      t("MONOPRIX 1", -10),
      t("MONOPRIX 1", -10),
      t("MONOPRIX 2", -10),
      t("MONOPRIX 3", -10),
      t("MONOPRIX 4", -10),
      t("MONOPRIX 5", -10),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe("monoprix");
    expect(out[0].samples).toHaveLength(4);
    expect(new Set(out[0].samples).size).toBe(4);
    // Le plus fréquent d'abord.
    expect(out[0].samples[0]).toBe("MONOPRIX 1");
  });

  it("classe par total non classé décroissant", () => {
    const out = queue([
      t("PETIT COMMERCE", -5),
      t("GROS COMMERCE", -500),
      t("MOYEN COMMERCE", -50),
    ]);
    expect(out.map((m) => m.key)).toEqual([
      "gros commerce",
      "moyen commerce",
      "petit commerce",
    ]);
  });
});

describe("triageQueue — la suggestion", () => {
  it("propose la catégorie déjà majoritaire chez ce commerçant", () => {
    const out = queue([
      t("MONOPRIX PARIS", -10, "cat-courses"),
      t("MONOPRIX PARIS", -10, "cat-courses"),
      t("MONOPRIX PARIS", -10, "cat-resto"),
      t("MONOPRIX PARIS", -10, null),
    ]);
    expect(out[0].suggestion).toBe("Courses alimentaires");
  });

  it("ne prend jamais le repli pour une suggestion", () => {
    const out = queue([
      t("MONOPRIX PARIS", -10, "cat-autres"),
      t("MONOPRIX PARIS", -10, "cat-autres"),
      t("MONOPRIX PARIS", -10, "cat-resto"),
    ]);
    expect(out[0].suggestion).toBe("Restaurants & Sorties");
  });

  it("propose Virements reçus pour un virement entrant", () => {
    const out = queue([t("VIREMENT DE PAUL", 120, null)]);
    expect(out[0].suggestion).toBe("Virements reçus");
  });

  it("propose Virements émis pour un virement sortant", () => {
    const out = queue([t("VIR SEPA EMIS /BEN PAUL", -120, null)]);
    expect(out[0].suggestion).toBe("Virements émis");
  });

  it("propose Frais bancaires sur une commission", () => {
    const out = queue([t("COMMISSION INTERVENTION", -8, null)]);
    expect(out[0].suggestion).toBe("Frais bancaires");
  });

  it("ne propose rien sur un commerçant inconnu", () => {
    // Une suggestion inventée serait acceptée d'un tap au vingtième écran.
    expect(queue([t("SARL DUPONT", -42, null)])[0].suggestion).toBeNull();
  });

  it("préfère l'historique au motif de virement", () => {
    const out = queue([
      t("VIREMENT DE PAUL", 120, "cat-resto"),
      t("VIREMENT DE PAUL", 120, null),
    ]);
    expect(out[0].suggestion).toBe("Restaurants & Sorties");
  });

  it("ne propose une catégorie de virement que si elle existe", () => {
    // Un utilisateur peut avoir supprimé ces catégories : ne rien proposer
    // vaut mieux que proposer un nom qui n'ouvrira sur rien.
    const out = triageQueue({
      txns: [t("VIREMENT DE PAUL", 120, null)],
      categoryNameById: new Map([["cat-courses", "Courses alimentaires"]]),
      ruledKeys: new Set(),
    });
    expect(out[0].suggestion).toBeNull();
  });
});

describe("frequentCategories", () => {
  const freq = (txns: Txn[], n: number) =>
    frequentCategories(txns, NAMES, n);

  it("classe par nombre de lignes déjà classées", () => {
    const out = freq(
      [
        t("A", -1, "cat-resto"),
        t("B", -1, "cat-courses"),
        t("C", -1, "cat-courses"),
        t("D", -1, "cat-courses"),
        t("E", -1, "cat-resto"),
        t("F", -1, "cat-frais"),
      ],
      3
    );
    expect(out).toEqual([
      "Courses alimentaires",
      "Restaurants & Sorties",
      "Frais bancaires",
    ]);
  });

  it("respecte n", () => {
    const out = freq(
      [t("A", -1, "cat-resto"), t("B", -1, "cat-courses")],
      1
    );
    expect(out).toHaveLength(1);
  });

  it("exclut le repli", () => {
    const out = freq(
      [
        t("A", -1, "cat-autres"),
        t("B", -1, "cat-autres"),
        t("C", -1, "cat-resto"),
      ],
      5
    );
    expect(out).toEqual(["Restaurants & Sorties"]);
  });

  it("rend une liste vide sur un historique sans rien de classé", () => {
    expect(freq([t("A", -1, null), t("B", -1, "cat-autres")], 5)).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/cockpit/triage.test.ts`
Expected: FAIL — « Failed to resolve import "./triage" ».

- [ ] **Step 3: Écrire le module**

Créer `lib/cockpit/triage.ts` :

```ts
import type { Txn } from "./types";
import { merchantKey } from "./payee-key";

/**
 * La file de tri : les commerçants dont il reste des lignes non classées.
 *
 * Par commerçant et non par opération, parce qu'une décision par commerçant
 * règle toutes ses lignes d'un geste et enseigne une règle à l'app — 847
 * lignes se replient en quelques dizaines de décisions.
 */
export type TriageMerchant = {
  key: string;
  /** Libellé le plus fréquent du groupe. */
  label: string;
  /** Opérations NON classées seulement. */
  count: number;
  /** Somme en valeur absolue des opérations non classées. */
  total: number;
  firstDate: string;
  lastDate: string;
  /** Jusqu'à 4 libellés distincts, le plus fréquent d'abord. */
  samples: string[];
  /** Nom de catégorie proposé, ou null quand l'app ne sait pas. */
  suggestion: string | null;
};

const FALLBACK = "Autres";
const MAX_SAMPLES = 4;

/** Une ligne est non classée si elle n'a pas de catégorie utilisable. */
function isUnsorted(
  t: Txn,
  names: Map<string, string>,
  fallback: string
): boolean {
  if (!t.category_id) return true;
  const name = names.get(t.category_id);
  // Une catégorie supprimée laisse un identifiant orphelin : la ligne n'est
  // pas classée pour autant.
  if (!name) return true;
  return name === fallback;
}

/** Clé du plus grand compteur d'une map, `null` si elle est vide. */
function topOf(counts: Map<string, number>): string | null {
  let best: string | null = null;
  let n = -1;
  for (const [k, c] of counts) {
    if (c > n) {
      n = c;
      best = k;
    }
  }
  return best;
}

/**
 * Ce que l'app peut honnêtement proposer, dans l'ordre d'essai.
 *
 * Les catégories de l'export BNP ne sont PAS une source ici : elles existent
 * à l'import mais ne sont stockées nulle part, donc elles n'existent pas pour
 * les lignes déjà en base. Quand aucune source ne parle, on ne propose rien —
 * une suggestion fausse serait acceptée d'un tap au vingtième écran.
 */
function suggest(
  sortedCategoryCounts: Map<string, number>,
  samples: string[],
  signedTotal: number,
  names: Map<string, string>
): string | null {
  // 1. L'historique partiel du commerçant : le signal le plus fort.
  const fromHistory = topOf(sortedCategoryCounts);
  if (fromHistory) return fromHistory;

  const known = new Set(names.values());
  const first = samples[0] ?? "";

  // 2. Motif de virement, comme `isTransferLabel` dans classify.ts.
  if (/^VIR|^VIREMENT/i.test(first)) {
    const name = signedTotal >= 0 ? "Virements reçus" : "Virements émis";
    return known.has(name) ? name : null;
  }

  // 3. La devinette timide existante.
  if (first.toUpperCase().includes("COMMISSION")) {
    return known.has("Frais bancaires") ? "Frais bancaires" : null;
  }

  return null;
}

export function triageQueue(input: {
  txns: Txn[];
  categoryNameById: Map<string, string>;
  ruledKeys: Set<string>;
  fallbackName?: string;
}): TriageMerchant[] {
  const { txns, categoryNameById: names, ruledKeys } = input;
  const fallback = input.fallbackName ?? FALLBACK;

  type Group = {
    count: number;
    total: number;
    signedTotal: number;
    firstDate: string;
    lastDate: string;
    labels: Map<string, number>;
    sortedCats: Map<string, number>;
  };
  const groups = new Map<string, Group>();

  for (const t of txns) {
    const key = merchantKey(t.description);
    if (!key) continue;
    if (ruledKeys.has(key)) continue;

    const g =
      groups.get(key) ??
      {
        count: 0,
        total: 0,
        signedTotal: 0,
        firstDate: "",
        lastDate: "",
        labels: new Map<string, number>(),
        sortedCats: new Map<string, number>(),
      };
    groups.set(key, g);

    if (!isUnsorted(t, names, fallback)) {
      // Ligne déjà classée : elle ne pèse pas dans la file, mais elle informe
      // la suggestion.
      const name = names.get(t.category_id as string) as string;
      g.sortedCats.set(name, (g.sortedCats.get(name) ?? 0) + 1);
      continue;
    }

    g.count += 1;
    g.total += Math.abs(Number(t.amount));
    g.signedTotal += Number(t.amount);
    if (!g.firstDate || t.date < g.firstDate) g.firstDate = t.date;
    if (t.date > g.lastDate) g.lastDate = t.date;
    g.labels.set(t.description, (g.labels.get(t.description) ?? 0) + 1);
  }

  const out: TriageMerchant[] = [];
  for (const [key, g] of groups) {
    if (!g.count) continue;

    const samples = [...g.labels.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_SAMPLES)
      .map(([label]) => label);

    out.push({
      key,
      label: samples[0] ?? key,
      count: g.count,
      total: g.total,
      firstDate: g.firstDate,
      lastDate: g.lastDate,
      samples,
      suggestion: suggest(g.sortedCats, samples, g.signedTotal, names),
    });
  }

  return out.sort((a, b) => b.total - a.total);
}

/**
 * Les catégories où l'utilisateur classe le plus, pour que les propositions
 * de l'écran soient les siennes et non celles du seed.
 */
export function frequentCategories(
  txns: Txn[],
  categoryNameById: Map<string, string>,
  n: number,
  fallbackName?: string
): string[] {
  const fallback = fallbackName ?? FALLBACK;
  const counts = new Map<string, number>();
  for (const t of txns) {
    if (!t.category_id) continue;
    const name = categoryNameById.get(t.category_id);
    if (!name || name === fallback) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name]) => name);
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run lib/cockpit/triage.test.ts`
Expected: PASS (25 tests).

Run: `npm run test` puis `npx tsc --noEmit`
Expected: PASS, aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/triage.ts lib/cockpit/triage.test.ts
git commit -m "feat(cockpit): unsorted-merchant queue

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: L'écran de tri et son accès

**Files:**
- Create: `app/cockpit/tri/page.tsx`
- Modify: `app/cockpit/commercants/page.tsx`

**Interfaces:**
- Consumes: `triageQueue`, `frequentCategories`, `TriageMerchant` (Task 1) ; `useAllTransactions`, `useAuth`, `useCategories`, `useCategoryRules` (`lib/cockpit/hooks.ts`) ; `updateTransactionsCategory` (`lib/cockpit/transactions-api.ts`) ; `setCategoryRules` (`lib/cockpit/category-rules-api.ts`) ; `merchantKey` (`lib/cockpit/payee-key.ts`) ; `CategoryPickerSheet` (`components/cockpit/CategoryPickerSheet.tsx`) ; `eur`, `axisMonthLabel` (`lib/cockpit/format.ts`).
- Produces: rien.

Rappels d'API vérifiés, à utiliser tels quels :

- `useCategoryRules(userId)` rend `{ rules: Map<payee_key, category_id>, loaded, refetch }`.
- `useAllTransactions()` rend `{ txns, loading, error, refetch }`.
- `useCategories()` rend `{ categories }`, chaque catégorie portant `{ id, name, type, color, active? }`.
- `updateTransactionsCategory(ids: string[], categoryId: string, type: string)`.
- `setCategoryRules(userId, [{ payeeKey, categoryId }])`.
- `CategoryPickerSheet` prend `{ categories, title, onPick: (name: string) => void, onClose }`.

- [ ] **Step 1: Écrire l'écran**

Créer `app/cockpit/tri/page.tsx` :

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SkipForward, Sparkles } from "lucide-react";
import {
  useAllTransactions,
  useAuth,
  useCategories,
  useCategoryRules,
} from "@/lib/cockpit/hooks";
import { triageQueue, frequentCategories } from "@/lib/cockpit/triage";
import type { TriageMerchant } from "@/lib/cockpit/triage";
import { merchantKey } from "@/lib/cockpit/payee-key";
import { updateTransactionsCategory } from "@/lib/cockpit/transactions-api";
import { setCategoryRules } from "@/lib/cockpit/category-rules-api";
import { CategoryPickerSheet } from "@/components/cockpit/CategoryPickerSheet";
import { axisMonthLabel, eur } from "@/lib/cockpit/format";

const SUGGESTED_COUNT = 5;

export default function TriPage() {
  const user = useAuth();
  const { txns, loading, error, refetch } = useAllTransactions();
  const { categories } = useCategories();
  const { rules, loaded: rulesLoaded, refetch: refetchRules } =
    useCategoryRules(user.id);

  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [showAll, setShowAll] = useState(false);

  const activeCategories = useMemo(
    () => categories.filter((c) => c.active !== false),
    [categories]
  );
  const categoryNameById = useMemo(
    () => new Map(activeCategories.map((c) => [c.id, c.name])),
    [activeCategories]
  );

  const queue = useMemo(
    () =>
      triageQueue({
        txns,
        categoryNameById,
        ruledKeys: new Set(rules.keys()),
      }),
    [txns, categoryNameById, rules]
  );

  // Les commerçants passés sortent de la file affichée : sans cela le
  // compteur stagnerait et l'écran perdrait sa seule promesse.
  const remaining = useMemo(
    () => queue.filter((m) => !skipped.has(m.key)),
    [queue, skipped]
  );
  const current: TriageMerchant | null = remaining[0] ?? null;
  const remainingTotal = remaining.reduce((a, m) => a + m.total, 0);

  const frequent = useMemo(
    () => frequentCategories(txns, categoryNameById, SUGGESTED_COUNT),
    [txns, categoryNameById]
  );

  // La suggestion d'abord, puis les habitudes, sans doublon.
  const chips = useMemo(() => {
    if (!current) return [];
    const out = current.suggestion ? [current.suggestion] : [];
    for (const name of frequent) {
      if (out.length >= SUGGESTED_COUNT + 1) break;
      if (!out.includes(name)) out.push(name);
    }
    return out;
  }, [current, frequent]);

  const ready = !loading && rulesLoaded;

  const apply = async (categoryName: string) => {
    setShowAll(false);
    if (!current) return;
    const cat = activeCategories.find((c) => c.name === categoryName);
    if (!cat) return;

    // Seules les lignes non classées de ce commerçant : les autres portent une
    // décision antérieure que ce tri n'a pas à défaire.
    const ids = txns
      .filter((t) => merchantKey(t.description) === current.key)
      .filter((t) => {
        if (!t.category_id) return true;
        const name = categoryNameById.get(t.category_id);
        return !name || name === "Autres";
      })
      .map((t) => t.id);

    setBusy(true);
    setFailure("");
    let moved = false;
    try {
      if (ids.length) {
        await updateTransactionsCategory(ids, cat.id, cat.type);
        moved = true;
      }
      await setCategoryRules(user.id, [
        { payeeKey: current.key, categoryId: cat.id },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      // Distinguer les deux échecs : si les lignes sont déjà déplacées, le
      // dire, sinon l'utilisateur croit que rien n'a bougé et recommence.
      setFailure(
        moved
          ? `Lignes reclassées, mais la règle n'a pas pu être enregistrée : ${msg}`
          : msg
      );
    } finally {
      setBusy(false);
      // La file est toujours recalculée depuis la base, jamais retirée de
      // l'affichage à la main.
      refetch();
      refetchRules();
    }
  };

  const periode = (m: TriageMerchant) => {
    const from = axisMonthLabel(m.firstDate.slice(0, 7));
    const to = axisMonthLabel(m.lastDate.slice(0, 7));
    return from === to ? `en ${from}` : `de ${from} à ${to}`;
  };

  return (
    <main className="max-w-[600px] mx-auto px-5 pt-8 pb-24">
      <header className="mb-4">
        <Link href="/cockpit/commercants" className="text-ink-muted text-sm">
          ‹ Commerçants
        </Link>
        <h1 className="font-display text-2xl mt-2">Trier</h1>
        <p className="text-[13px] text-ink-muted mt-1">
          {!ready
            ? "Chargement…"
            : `Reste ${remaining.length} commerçant${
                remaining.length > 1 ? "s" : ""
              } · ${eur(remainingTotal)}`}
        </p>
      </header>

      {error && (
        <p className="text-accent text-[13px] mb-5">
          L&apos;historique des opérations n&apos;a pas pu être chargé. Réessaie
          plus tard.
        </p>
      )}

      {ready && !error && !current && (
        <div className="bg-card rounded-2xl p-6 text-center">
          <p className="text-sm text-ink mb-1">Tout est trié.</p>
          <p className="text-[12.5px] text-ink-muted mb-3">
            Chaque commerçant a une catégorie ou une règle.
          </p>
          <Link
            href="/cockpit/commercants"
            className="text-[13px] text-ink underline"
          >
            Voir les commerçants
          </Link>
        </div>
      )}

      {ready && !error && current && (
        <div className="bg-card rounded-2xl p-4">
          <div className="text-[15px] font-medium break-words">
            {current.label}
          </div>
          <div className="text-[12.5px] text-ink-muted mt-0.5">
            <span className="font-mono-num">{current.count}</span> opération
            {current.count > 1 ? "s" : ""} ·{" "}
            <span className="font-mono-num">{eur(current.total)}</span> ·{" "}
            {periode(current)}
          </div>

          {current.samples.length > 1 && (
            <div className="mt-3 pt-3 border-t border-rule">
              {/* Les exemples révèlent un regroupement abusif avant qu'on
                  classe vingt lignes d'un coup. */}
              <div className="text-[11px] uppercase tracking-wide text-ink-muted mb-1">
                Libellés regroupés
              </div>
              {current.samples.map((s) => (
                <div
                  key={s}
                  className="text-[11.5px] text-ink-muted break-words"
                >
                  {s}
                </div>
              ))}
            </div>
          )}

          {failure && (
            <p className="text-accent text-[12.5px] mt-3">{failure}</p>
          )}

          <div className="mt-4 grid gap-1.5">
            {chips.map((name) => {
              const suggested = name === current.suggestion;
              return (
                <button
                  key={name}
                  type="button"
                  disabled={busy}
                  onClick={() => apply(name)}
                  className={`flex items-center gap-2 text-left py-3 px-3 rounded-lg text-[14px] disabled:opacity-50 ${
                    suggested
                      ? "bg-emerald text-paper font-semibold"
                      : "bg-seg text-ink"
                  }`}
                >
                  {suggested && <Sparkles size={15} />}
                  {name}
                  {suggested && (
                    <span className="ml-auto text-[11.5px] opacity-80">
                      suggérée
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex gap-3 mt-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => setShowAll(true)}
              className="flex-1 text-[13px] text-ink-muted py-2.5 disabled:opacity-50"
            >
              Toutes les catégories…
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setSkipped((s) => new Set(s).add(current.key))
              }
              className="flex items-center gap-1.5 text-[13px] text-ink-muted py-2.5 disabled:opacity-50"
            >
              <SkipForward size={15} />
              Passer
            </button>
          </div>
        </div>
      )}

      {showAll && current && (
        <CategoryPickerSheet
          categories={activeCategories}
          title={`Classer ${current.label}`}
          onPick={(name) => apply(name)}
          onClose={() => setShowAll(false)}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 2: Ouvrir l'accès depuis l'écran Commerçants**

Dans `app/cockpit/commercants/page.tsx`, l'en-tête de la vue liste est :

```tsx
          <header className="mb-4">
            <Link href="/cockpit" className="text-ink-muted text-sm">
              ‹ Cockpit
            </Link>
            <h1 className="font-display text-2xl mt-2">Commerçants</h1>
```

Remplacer la ligne du titre par un titre suivi d'un lien, sur la même ligne :

```tsx
            <div className="flex items-baseline justify-between gap-3 mt-2">
              <h1 className="font-display text-2xl">Commerçants</h1>
              <Link href="/cockpit/tri" className="text-[12px] text-ink-muted">
                Trier
              </Link>
            </div>
```

Ne rien changer d'autre dans ce fichier : le paragraphe de comptage qui suit le titre reste tel quel.

- [ ] **Step 3: Vérifier**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

Run: `npm run test`
Expected: PASS, snapshots de `lib/simulator.test.ts` intacts.

Run: `npm run build`
Expected: build réussi, la route `/cockpit/tri` apparaît dans la liste.

- [ ] **Step 4: Commit**

```bash
git add app/cockpit/tri/page.tsx app/cockpit/commercants/page.tsx
git commit -m "feat(cockpit): quick-sort screen for unsorted merchants

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Smoke test manuel (à faire par l'utilisateur)**

1. `npm run dev`, ouvrir Commerçants → « Trier ». Le compteur annonce un nombre de commerçants et un montant.
2. Classer le premier : il disparaît, le compteur décroît, et le suivant apparaît.
3. Rouvrir la modale des règles (Réglages) ou réimporter un export : le commerçant classé ne doit plus jamais revenir dans la file.
4. « Passer » sur un commerçant : il disparaît de la session, et revient après un rechargement de la page.
5. Sur un commerçant partiellement classé, vérifier que le compteur d'opérations ne compte que les lignes non classées.

---

## Notes d'exécution

- **Ordre contraignant** : Task 1 avant Task 2.
- **Ne jamais lancer vitest avec `--update`** : `lib/simulator.test.ts` contient des snapshots de caractérisation d'un autre chantier.
- Aucune migration SQL dans ce chantier.
- `lib/cockpit/triage.ts` ne connaît ni React, ni Supabase : si une tâche a besoin d'y importer l'un ou l'autre, c'est que le calcul est au mauvais endroit.
- Le nom de repli « Autres » apparaît en dur à deux endroits de l'écran (le filtre des lignes à déplacer) et dans le module (constante `FALLBACK`). C'est assumé : `FALLBACK_CATEGORY` existe déjà dans `classify.ts`, mais l'importer depuis `triage.ts` créerait une dépendance entre deux modules qui n'ont rien d'autre en commun. Si un troisième usage apparaît, extraire la constante.
