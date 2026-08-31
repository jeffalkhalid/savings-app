# Rattachement du salaire au mois suivant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un revenu identifié comme salaire et versé dans les derniers jours du mois compte pour le mois suivant, sans que sa date stockée soit modifiée, et sans rien changer pour un utilisateur qui ne configure rien.

**Architecture :** un module pur `budget-month.ts` décide à quel mois budgétaire appartient chaque transaction, selon quatre conditions cumulatives ; `useTransactions` élargit sa fenêtre de requête de quelques jours vers l'arrière et partitionne en JS ; la configuration vit dans une colonne JSONB de `user_settings` et se règle depuis Réglages.

**Tech Stack :** Next.js 15 (App Router), React 19, TypeScript, Tailwind 3, Supabase (Postgres + RLS), Vitest 4, lucide-react.

**Spec :** `docs/superpowers/specs/2026-08-31-salaire-mois-suivant-design.md`

## Global Constraints

- Le français est la langue de toute l'UI et des messages d'erreur affichés.
- Icônes : **lucide-react** uniquement, jamais d'emoji.
- Montants en `.font-mono-num` ; tokens Boussole (`text-ink`, `text-ink-muted`, `bg-card`, `bg-paper`, `border-rule`, `text-accent`, `bg-seg`, `bg-emerald`, `text-strat-a`).
- Les modules `lib/` restent purs (aucun import React, aucun accès réseau) sauf `*-api.ts` et `hooks.ts`.
- Les modales suivent le patron existant (`ReglagesModal.tsx`, `BudgetsModal.tsx`) — pas de primitive `Sheet` partagée dans ce repo.
- Aucune migration n'est appliquée par l'agent : les fichiers `supabase/*.sql` sont exécutés à la main par l'utilisateur dans le SQL editor.
- Commits en anglais, format `type(scope): message`, avec la ligne `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Tests : `npm run test` (Vitest 4). Vérification finale : `npx tsc --noEmit` puis `npm run build`.
- **Ne jamais lancer vitest avec `--update` ou `-u`** : `lib/simulator.test.ts` contient des snapshots de caractérisation d'un autre chantier.
- **Configuration vide = comportement actuel à l'identique.** C'est l'invariant de sûreté du chantier : tant que l'utilisateur n'a rien réglé, aucune transaction ne se déplace.

---

### Task 1: Module `budget-month.ts`

**Files:**
- Create: `lib/cockpit/budget-month.ts`
- Test: `lib/cockpit/budget-month.test.ts`

**Interfaces:**
- Consumes: `Txn` (`lib/cockpit/types.ts`), `merchantKey` (`lib/cockpit/payee-key.ts`).
- Produces:
  - `type SalaryShift = { payeeKeys: string[]; categoryIds: string[]; days: number }`
  - `const DEFAULT_SHIFT: SalaryShift` — listes vides, `days: 4`
  - `function daysInMonth(month: string): number`
  - `function nextMonth(month: string): string`
  - `function shiftWindowStart(month: string, days: number): string`
  - `function isShifted(t: Txn, s: SalaryShift): boolean`
  - `function budgetMonthOf(t: Txn, s: SalaryShift): string`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `lib/cockpit/budget-month.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import {
  budgetMonthOf,
  daysInMonth,
  DEFAULT_SHIFT,
  isShifted,
  nextMonth,
  shiftWindowStart,
} from "./budget-month";
import type { Txn } from "./types";

const SHIFT = {
  payeeKeys: ["carrefour france"],
  categoryIds: ["cat-salaire"],
  days: 4,
};

const salaire = (date: string, over: Partial<Txn> = {}): Txn => ({
  id: "1",
  date,
  amount: 3200,
  description:
    "VIR SEPA RECU /DE CARREFOUR FRANCE /MOTIF  /REF CARREFOUR 1961870275237171845034602",
  type: "income",
  category_id: "cat-salaire",
  ...over,
});

describe("daysInMonth", () => {
  it("compte les jours réels du mois", () => {
    expect(daysInMonth("2026-08")).toBe(31);
    expect(daysInMonth("2026-04")).toBe(30);
    expect(daysInMonth("2026-02")).toBe(28);
  });
  it("gère les années bissextiles", () => {
    expect(daysInMonth("2028-02")).toBe(29);
  });
});

describe("nextMonth", () => {
  it("avance d'un mois", () => {
    expect(nextMonth("2026-08")).toBe("2026-09");
  });
  it("passe l'année en décembre", () => {
    expect(nextMonth("2026-12")).toBe("2027-01");
  });
});

describe("shiftWindowStart", () => {
  it("donne le premier jour du mois précédent qui peut basculer", () => {
    // août a 31 jours, fenêtre de 4 → 28, 29, 30, 31
    expect(shiftWindowStart("2026-09", 4)).toBe("2026-08-28");
  });
  it("s'adapte à un mois de 30 jours", () => {
    expect(shiftWindowStart("2026-05", 4)).toBe("2026-04-27");
  });
  it("s'adapte à février", () => {
    expect(shiftWindowStart("2026-03", 4)).toBe("2026-02-25");
  });
  it("recule d'une année depuis janvier", () => {
    expect(shiftWindowStart("2027-01", 4)).toBe("2026-12-28");
  });
});

describe("isShifted — les quatre conditions", () => {
  it("bascule quand les quatre sont réunies", () => {
    expect(isShifted(salaire("2026-08-29"), SHIFT)).toBe(true);
  });
  it("ne bascule pas hors de la fenêtre", () => {
    expect(isShifted(salaire("2026-08-27"), SHIFT)).toBe(false);
  });
  it("ne bascule pas si le payeur ne correspond pas", () => {
    const t = salaire("2026-08-29", {
      description: "VIR SEPA RECU /DE AUTRE EMPLOYEUR /REF X",
    });
    expect(isShifted(t, SHIFT)).toBe(false);
  });
  it("ne bascule pas si la catégorie ne correspond pas", () => {
    expect(isShifted(salaire("2026-08-29", { category_id: "cat-autre" }), SHIFT)).toBe(false);
  });
  it("ne bascule pas sans catégorie", () => {
    expect(isShifted(salaire("2026-08-29", { category_id: null }), SHIFT)).toBe(false);
  });
  it("ne bascule pas si le type n'est pas income", () => {
    expect(isShifted(salaire("2026-08-29", { type: "expense" }), SHIFT)).toBe(false);
  });
  it("prend le dernier jour du mois", () => {
    expect(isShifted(salaire("2026-08-31"), SHIFT)).toBe(true);
  });
  it("prend le premier jour de la fenêtre", () => {
    expect(isShifted(salaire("2026-08-28"), SHIFT)).toBe(true);
  });
  it("ajuste la fenêtre sur un mois court", () => {
    // février 2026 : 28 jours, fenêtre de 4 → 25, 26, 27, 28
    expect(isShifted(salaire("2026-02-25"), SHIFT)).toBe(true);
    expect(isShifted(salaire("2026-02-24"), SHIFT)).toBe(false);
  });
});

describe("isShifted — configuration vide", () => {
  it("ne déplace jamais rien avec DEFAULT_SHIFT", () => {
    expect(isShifted(salaire("2026-08-29"), DEFAULT_SHIFT)).toBe(false);
    expect(isShifted(salaire("2026-08-31"), DEFAULT_SHIFT)).toBe(false);
  });
  it("ne déplace rien si seule la liste de payeurs est remplie", () => {
    const s = { payeeKeys: ["carrefour france"], categoryIds: [], days: 4 };
    expect(isShifted(salaire("2026-08-29"), s)).toBe(false);
  });
  it("ne déplace rien si seule la liste de catégories est remplie", () => {
    const s = { payeeKeys: [], categoryIds: ["cat-salaire"], days: 4 };
    expect(isShifted(salaire("2026-08-29"), s)).toBe(false);
  });
});

describe("budgetMonthOf", () => {
  it("renvoie le mois suivant pour une ligne qui bascule", () => {
    expect(budgetMonthOf(salaire("2026-08-29"), SHIFT)).toBe("2026-09");
  });
  it("renvoie le mois de la date sinon", () => {
    expect(budgetMonthOf(salaire("2026-08-15"), SHIFT)).toBe("2026-08");
  });
  it("passe l'année en décembre", () => {
    expect(budgetMonthOf(salaire("2026-12-30"), SHIFT)).toBe("2027-01");
  });
  it("ne bouge rien avec la configuration par défaut", () => {
    expect(budgetMonthOf(salaire("2026-08-29"), DEFAULT_SHIFT)).toBe("2026-08");
  });
});

describe("partition — aucune transaction perdue ni comptée deux fois", () => {
  it("range chaque transaction dans exactement un mois budgétaire", () => {
    const txns: Txn[] = [
      salaire("2026-07-31"),        // → août
      salaire("2026-08-15", { id: "2" }), // → août (hors fenêtre)
      salaire("2026-08-29", { id: "3" }), // → septembre
      salaire("2026-09-30", { id: "4" }), // → octobre
    ];
    const months = txns.map((t) => budgetMonthOf(t, SHIFT));
    expect(months).toEqual(["2026-08", "2026-08", "2026-09", "2026-10"]);
    expect(new Set(txns.map((t) => t.id)).size).toBe(4);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/cockpit/budget-month.test.ts`
Expected: FAIL — « Failed to resolve import "./budget-month" ».

- [ ] **Step 3: Écrire le module**

Créer `lib/cockpit/budget-month.ts` :

```ts
import type { Txn } from "./types";
import { merchantKey } from "./payee-key";

/**
 * Rattachement d'un revenu au mois suivant.
 *
 * Un salaire versé le dernier jour ouvré du mois finance le mois suivant. On ne
 * touche jamais à la date stockée : seule l'attribution mensuelle change.
 */
export type SalaryShift = {
  /** Clés commerçant qui déclenchent le rattachement. */
  payeeKeys: string[];
  /** Garde-fou : catégories concernées. */
  categoryIds: string[];
  /** Taille de la fenêtre de fin de mois, en jours. */
  days: number;
};

/** Listes vides : aucune transaction ne se déplace. */
export const DEFAULT_SHIFT: SalaryShift = {
  payeeKeys: [],
  categoryIds: [],
  days: 4,
};

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  // Le jour 0 du mois suivant est le dernier jour du mois demandé.
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12
    ? `${y + 1}-01`
    : `${y}-${String(m + 1).padStart(2, "0")}`;
}

function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1
    ? `${y - 1}-12`
    : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/**
 * Premier jour du mois PRÉCÉDENT dont une transaction peut être rattachée à
 * `month`. Pilote l'élargissement de la requête.
 */
export function shiftWindowStart(month: string, days: number): string {
  const prev = previousMonth(month);
  const firstDay = daysInMonth(prev) - days + 1;
  return `${prev}-${String(firstDay).padStart(2, "0")}`;
}

/** Les quatre conditions, toutes requises. */
export function isShifted(t: Txn, s: SalaryShift): boolean {
  if (t.type !== "income") return false;
  if (!t.category_id) return false;
  if (!s.payeeKeys.length || !s.categoryIds.length) return false;
  if (!s.categoryIds.includes(t.category_id)) return false;
  if (!s.payeeKeys.includes(merchantKey(t.description))) return false;

  const month = t.date.slice(0, 7);
  const day = Number(t.date.slice(8, 10));
  return day > daysInMonth(month) - s.days;
}

/** Mois budgétaire d'une transaction, au format YYYY-MM. */
export function budgetMonthOf(t: Txn, s: SalaryShift): string {
  const month = t.date.slice(0, 7);
  return isShifted(t, s) ? nextMonth(month) : month;
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run lib/cockpit/budget-month.test.ts`
Expected: PASS (25 tests).

Run: `npm run test` puis `npx tsc --noEmit`
Expected: PASS, aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/budget-month.ts lib/cockpit/budget-month.test.ts
git commit -m "feat(budget): budget-month attribution for end-of-month salary

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Persistance du réglage

**Files:**
- Create: `supabase/2026-08-31-salary-shift.sql`
- Modify: `lib/cockpit/budget-month.ts` (ajouter `parseSalaryShift`)
- Modify: `lib/cockpit/budget-month.test.ts`
- Modify: `lib/cockpit/settings.ts`
- Modify: `lib/cockpit/settings.test.ts`
- Modify: `lib/cockpit/user-settings-api.ts`

**Interfaces:**
- Consumes: `SalaryShift`, `DEFAULT_SHIFT` (Task 1).
- Produces:
  - `function parseSalaryShift(raw: unknown): SalaryShift` — ne lève jamais.
  - `UserSettings` gagne `salary_shift: SalaryShift`.
  - `saveSalaryShift(userId: string, shift: SalaryShift): Promise<void>`.

- [ ] **Step 1: Écrire la migration**

Créer `supabase/2026-08-31-salary-shift.sql` :

```sql
-- Rattachement du salaire au mois suivant, par utilisateur.
-- À exécuter dans Supabase SQL editor.
-- NULL = aucun rattachement (comportement historique inchangé).
alter table public.user_settings
  add column if not exists salary_shift jsonb;
```

Aucune policy à ajouter : `user_settings` est déjà en RLS `auth.uid() = user_id`.

- [ ] **Step 2: Écrire les tests du parseur**

Ajouter à la fin de `lib/cockpit/budget-month.test.ts`, et compléter la ligne d'import du haut pour inclure `parseSalaryShift` :

```ts
describe("parseSalaryShift", () => {
  it("retombe sur le défaut pour null ou undefined", () => {
    expect(parseSalaryShift(null)).toEqual(DEFAULT_SHIFT);
    expect(parseSalaryShift(undefined)).toEqual(DEFAULT_SHIFT);
  });
  it("retombe sur le défaut pour un objet étranger", () => {
    expect(parseSalaryShift({ hello: "world" })).toEqual(DEFAULT_SHIFT);
    expect(parseSalaryShift("nope")).toEqual(DEFAULT_SHIFT);
    expect(parseSalaryShift(42)).toEqual(DEFAULT_SHIFT);
  });
  it("conserve une configuration valide", () => {
    const s = { payeeKeys: ["carrefour france"], categoryIds: ["c1"], days: 4 };
    expect(parseSalaryShift(s)).toEqual(s);
  });
  it("ignore les entrées non textuelles des listes", () => {
    const s = { payeeKeys: ["ok", 3, null], categoryIds: ["c1"], days: 4 };
    expect(parseSalaryShift(s).payeeKeys).toEqual(["ok"]);
  });
  it("borne days entre 1 et 15", () => {
    expect(parseSalaryShift({ payeeKeys: [], categoryIds: [], days: 0 }).days).toBe(4);
    expect(parseSalaryShift({ payeeKeys: [], categoryIds: [], days: 99 }).days).toBe(4);
    expect(parseSalaryShift({ payeeKeys: [], categoryIds: [], days: 7 }).days).toBe(7);
  });
  it("renvoie une copie, pas la constante partagée", () => {
    const parsed = parseSalaryShift(null);
    parsed.payeeKeys.push("x");
    expect(DEFAULT_SHIFT.payeeKeys).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/cockpit/budget-month.test.ts`
Expected: FAIL — `parseSalaryShift is not a function`.

- [ ] **Step 4: Implémenter le parseur**

Ajouter à la fin de `lib/cockpit/budget-month.ts` :

```ts
const MIN_DAYS = 1;
const MAX_DAYS = 15;

const stringsOf = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/**
 * Lit une configuration venue de la base (JSONB) ou d'un formulaire.
 * Ne lève jamais : tout ce qui est invalide retombe sur DEFAULT_SHIFT.
 */
export function parseSalaryShift(raw: unknown): SalaryShift {
  try {
    if (!raw || typeof raw !== "object") return { ...DEFAULT_SHIFT, payeeKeys: [], categoryIds: [] };
    const r = raw as Record<string, unknown>;
    const days = Number(r.days);
    return {
      payeeKeys: stringsOf(r.payeeKeys),
      categoryIds: stringsOf(r.categoryIds),
      days:
        isFinite(days) && days >= MIN_DAYS && days <= MAX_DAYS
          ? days
          : DEFAULT_SHIFT.days,
    };
  } catch {
    return { ...DEFAULT_SHIFT, payeeKeys: [], categoryIds: [] };
  }
}
```

Note : le repli construit des tableaux neufs pour que muter le résultat ne corrompe jamais
`DEFAULT_SHIFT`.

- [ ] **Step 5: Étendre `settings.ts`**

Dans `lib/cockpit/settings.ts` :
- ajouter à l'import du haut : `import { DEFAULT_SHIFT, parseSalaryShift, type SalaryShift } from "./budget-month";`
- ajouter `salary_shift: SalaryShift;` à `UserSettings` ;
- ajouter `salary_shift?: unknown;` à `UserSettingsRow` ;
- ajouter `salary_shift: DEFAULT_SHIFT,` à `DEFAULT_SETTINGS` ;
- dans `coerceSettings`, ajouter au retour de la branche `!row` **et** à celui de la branche
  normale : `salary_shift: parseSalaryShift(row?.salary_shift)`. Dans la branche `!row`, appeler
  `parseSalaryShift(null)` pour obtenir une copie fraîche plutôt que la constante partagée.

- [ ] **Step 6: Étendre les tests de `settings.ts`**

Dans `lib/cockpit/settings.test.ts`, ajouter :

```ts
  it("retombe sur le rattachement par défaut quand la colonne est vide", () => {
    expect(coerceSettings(null).salary_shift).toEqual(DEFAULT_SHIFT);
    expect(coerceSettings({ reporting_currency: "EUR" }).salary_shift).toEqual(DEFAULT_SHIFT);
  });

  it("lit le rattachement personnalisé de la colonne JSONB", () => {
    const s = { payeeKeys: ["carrefour france"], categoryIds: ["c1"], days: 4 };
    expect(
      coerceSettings({ reporting_currency: "EUR", salary_shift: s }).salary_shift
    ).toEqual(s);
  });
```

et compléter l'import du fichier avec `import { DEFAULT_SHIFT } from "@/lib/cockpit/budget-month";`.

- [ ] **Step 7: Étendre l'API**

Dans `lib/cockpit/user-settings-api.ts` :
- ajouter `salary_shift` au `select` de `getUserSettings` ;
- ajouter la fonction, sur le modèle de `saveAbondementBareme` :

```ts
export async function saveSalaryShift(
  userId: string,
  shift: SalaryShift
): Promise<void> {
  const { error } = await supabase.from("user_settings").upsert(
    { user_id: userId, salary_shift: shift },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(error.message);
}
```

avec l'import de type `SalaryShift` depuis `@/lib/cockpit/budget-month`.

- [ ] **Step 8: Vérifier**

Run: `npm run test`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 9: Commit**

```bash
git add supabase/2026-08-31-salary-shift.sql lib/cockpit/budget-month.ts lib/cockpit/budget-month.test.ts lib/cockpit/settings.ts lib/cockpit/settings.test.ts lib/cockpit/user-settings-api.ts
git commit -m "feat(budget): persist salary shift config in user_settings

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Lecture décalée dans `useTransactions`

**Files:**
- Modify: `lib/cockpit/hooks.ts` (`useTransactions`)
- Modify: `app/cockpit/page.tsx`

**Interfaces:**
- Consumes: `budgetMonthOf`, `shiftWindowStart`, `SalaryShift`, `DEFAULT_SHIFT` (Tasks 1–2) ; `useUserSettings` (existant).
- Produces: `useTransactions(month: string, shift: SalaryShift)` — la signature gagne un second paramètre.

- [ ] **Step 1: Élargir la requête et partitionner**

Dans `lib/cockpit/hooks.ts`, ajouter les imports :

```ts
import { budgetMonthOf, shiftWindowStart, type SalaryShift } from "./budget-month";
```

Remplacer `useTransactions` par :

```ts
export function useTransactions(month: string, shift: SalaryShift) {
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const shiftKey = `${shift.payeeKeys.join(",")}|${shift.categoryIds.join(",")}|${shift.days}`;

  const refetch = useCallback(() => {
    const { next } = monthRange(month);
    // Fenêtre élargie vers l'arrière : une transaction des derniers jours du
    // mois précédent peut être rattachée à ce mois-ci.
    const from = shiftWindowStart(month, shift.days);
    setLoading(true);
    supabase
      .from("transactions")
      .select("*")
      .gte("date", from)
      .lt("date", next)
      .order("date", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          setError(error.message);
        } else {
          setError(null);
          const all = (data as Txn[]) ?? [];
          setTxns(all.filter((t) => budgetMonthOf(t, shift) === month));
        }
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, shiftKey]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { txns, loading, error, refetch };
}
```

`shiftKey` sérialise la configuration pour que le hook se relance quand elle change, sans dépendre
de l'identité de l'objet `shift` (qui est recréé à chaque `coerceSettings`). Conserver la forme de
retour actuelle du hook (mêmes champs qu'aujourd'hui), pour ne pas casser son consommateur.

- [ ] **Step 2: Brancher la page Cockpit**

Dans `app/cockpit/page.tsx`, `useUserSettings(user.id)` est déjà appelé (variable `settings`).
Vérifier sa position : il doit être déclaré **avant** `useTransactions`. Puis remplacer :

```ts
  const { txns, refetch } = useTransactions(month);
```

par :

```ts
  const { txns, refetch } = useTransactions(month, settings.salary_shift);
```

Si `useUserSettings` est déclaré après, le remonter au-dessus de `useTransactions` sans rien
changer d'autre.

- [ ] **Step 3: Vérifier**

Run: `npx tsc --noEmit`
Expected: aucune erreur. Si un autre appelant de `useTransactions` apparaît, lui passer
`DEFAULT_SHIFT` et le signaler dans le rapport — au moment de l'écriture du plan, `app/cockpit/page.tsx`
est le seul.

Run: `npm run test`
Expected: PASS.

Run: `npm run build`
Expected: build réussi.

- [ ] **Step 4: Commit**

```bash
git add lib/cockpit/hooks.ts app/cockpit/page.tsx
git commit -m "feat(budget): widen the month query and partition by budget month

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Mention « rattaché à … » dans la liste

Sans cela, l'utilisateur voit une opération datée du 29 août dans son mois de septembre sans
explication.

**Files:**
- Modify: `components/cockpit/TxnRow.tsx`
- Modify: `components/cockpit/TxnList.tsx`
- Modify: `app/cockpit/page.tsx`

**Interfaces:**
- Consumes: `isShifted`, `SalaryShift` (Task 1).
- Produces: rien pour les tâches suivantes.

- [ ] **Step 1: Afficher la mention sur la ligne**

Dans `components/cockpit/TxnRow.tsx`, ajouter la prop `shiftedTo?: string` au composant :

```tsx
export function TxnRow({
  txn,
  categoryName,
  shiftedTo,
  onSelect,
}: {
  txn: Txn;
  categoryName?: string;
  shiftedTo?: string;
  onSelect: () => void;
}) {
```

et, dans la ligne de métadonnées sous la description (celle en `text-[11px] text-ink-muted`),
ajouter à la fin :

```tsx
        {shiftedTo && (
          <span className="ml-1 text-accent">· rattaché à {shiftedTo}</span>
        )}
```

- [ ] **Step 2: Faire passer l'information par la liste**

Dans `components/cockpit/TxnList.tsx`, ajouter la prop :

```tsx
  shiftedLabelOf?: (txn: Txn) => string | undefined;
```

et la transmettre à chaque `TxnRow`. La boucle du fichier est `{txns.map((t) => (` avec
`<TxnRow key={t.id} txn={t} categoryName={nameOf(t.category_id)} onSelect={() => onSelect(t)} />` :
ajouter `shiftedTo={shiftedLabelOf?.(t)}` à cette liste de props.

- [ ] **Step 3: Calculer le libellé dans la page**

Dans `app/cockpit/page.tsx`, ajouter l'import :

```ts
import { isShifted } from "@/lib/cockpit/budget-month";
```

`monthLabelOf` existe déjà dans ce fichier. Ajouter, à côté des autres `useMemo` :

```ts
  const shiftedLabelOf = useCallback(
    (t: Txn) =>
      isShifted(t, settings.salary_shift)
        ? monthLabelOf(month)
        : undefined,
    [settings.salary_shift, month]
  );
```

et passer `shiftedLabelOf={shiftedLabelOf}` au `TxnList`.

Note : une transaction affichée dans le mois `month` et qui `isShifted` vient forcément du mois
précédent — c'est exactement le cas où la mention doit apparaître, et le libellé à afficher est
celui du mois courant, où elle est rattachée.

Ajouter `useCallback` à l'import React du fichier s'il n'y est pas déjà.

- [ ] **Step 4: Vérifier**

Run: `npx tsc --noEmit` puis `npm run test` puis `npm run build`
Expected: aucune erreur, build réussi.

- [ ] **Step 5: Commit**

```bash
git add components/cockpit/TxnRow.tsx components/cockpit/TxnList.tsx app/cockpit/page.tsx
git commit -m "feat(budget): mark shifted transactions in the month list

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Réglage dans l'écran Réglages

**Files:**
- Create: `components/cockpit/SalaryShiftModal.tsx`
- Modify: `components/cockpit/ReglagesModal.tsx`

**Interfaces:**
- Consumes: `SalaryShift`, `DEFAULT_SHIFT`, `isShifted`, `merchantKey` ; `saveSalaryShift` (Task 2) ; `useAllTransactions`, `useCategories` (existants).
- Produces: rien.

- [ ] **Step 1: Écrire la modale**

Créer `components/cockpit/SalaryShiftModal.tsx` :

```tsx
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
```

- [ ] **Step 2: Ajouter l'entrée dans Réglages**

Dans `components/cockpit/ReglagesModal.tsx` :
- ajouter `import { SalaryShiftModal } from "@/components/cockpit/SalaryShiftModal";` ;
- ajouter l'état `const [showSalaryShift, setShowSalaryShift] = useState(false);` ;
- ajouter un bouton sous « Gérer les catégories », dans le même style que ses voisins :

```tsx
          <button
            type="button"
            onClick={() => setShowSalaryShift(true)}
            className="text-ink text-sm py-2 text-left"
          >
            Salaire rattaché au mois suivant
          </button>
```

- rendre la modale à côté des autres, en fin de composant :

```tsx
    {showSalaryShift && (
      <SalaryShiftModal
        userId={userId}
        shift={settings.salary_shift}
        categories={categories}
        allTxns={allTxns}
        onClose={() => setShowSalaryShift(false)}
        onSaved={() => {
          onSaved();
          setShowSalaryShift(false);
        }}
      />
    )}
```

`ReglagesModal` reçoit déjà `settings`, `categories`, `userId` et `onSaved` en props. Il ne reçoit
**pas** les transactions : ajouter une prop `allTxns: Txn[]` à `ReglagesModal` et la passer depuis
`app/cockpit/page.tsx`, où `useAllTransactions()` est déjà appelé (variable `allTxns`).

- [ ] **Step 3: Vérifier**

Run: `npx tsc --noEmit` puis `npm run test` puis `npm run build`
Expected: aucune erreur, build réussi.

- [ ] **Step 4: Commit**

```bash
git add components/cockpit/SalaryShiftModal.tsx components/cockpit/ReglagesModal.tsx app/cockpit/page.tsx
git commit -m "feat(budget): configure the salary shift from Réglages

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Smoke test manuel (à faire par l'utilisateur)**

1. Exécuter `supabase/2026-08-31-salary-shift.sql` dans le SQL editor Supabase.
2. `npm run dev`, Réglages → « Salaire rattaché au mois suivant » : cocher la catégorie Salaire et
   le payeur CARREFOUR FRANCE, vérifier l'aperçu du nombre d'opérations concernées, enregistrer.
3. Cockpit : le salaire versé fin août n'apparaît plus en août mais en septembre, avec la mention
   « rattaché à septembre ».
4. Vérifier que le taux d'épargne et le reste à vivre des deux mois ont changé en conséquence.
5. Décocher tout et enregistrer : l'app doit revenir exactement à son comportement précédent.

---

## Notes d'exécution

- **Ordre contraignant** : Task 1 avant tout le reste ; Task 2 avant 3 et 5 ; Task 3 avant 4 (la
  mention n'a de sens qu'une fois la partition en place).
- **Invariant de sûreté** : une configuration vide ne déplace rien. Chaque tâche doit préserver
  cela ; c'est ce qui rend le chantier sans risque pour un utilisateur qui ne configure pas.
- Les migrations SQL ne sont **pas** exécutées par les agents. Tant que
  `2026-08-31-salary-shift.sql` n'est pas passée, `getUserSettings` échouera sur la colonne inconnue
  et `useUserSettings` retombera sur `DEFAULT_SETTINGS` — donc `DEFAULT_SHIFT`, donc aucun
  déplacement. L'app reste utilisable.
- **Ne jamais lancer vitest avec `--update`** : `lib/simulator.test.ts` contient des snapshots de
  caractérisation d'un autre chantier.
