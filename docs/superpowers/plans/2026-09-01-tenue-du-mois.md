# Tenue du mois en cours — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une carte sur le Cockpit qui répond à « est-ce que je tiens jusqu'à la fin du mois » : ce qu'il reste réellement une fois les engagements à venir déduits, ce que cela fait par jour, et une estimation de fin de mois.

**Architecture :** un module pur calcule le disponible, le budget journalier et la projection à partir de chiffres que le Cockpit possède déjà (reste à vivre, engagements en attente, dépenses variables) ; une carte les affiche, uniquement sur le mois en cours.

**Tech Stack :** Next.js 15 (App Router), React 19, TypeScript, Tailwind 3, Vitest 4, lucide-react.

**Spec :** `docs/superpowers/specs/2026-09-01-tenue-du-mois-design.md`

## Global Constraints

- Le français est la langue de toute l'UI et des messages affichés, accord du pluriel compris.
- Icônes : **lucide-react** uniquement, jamais d'emoji.
- Montants et valeurs numériques en `.font-mono-num` ; tokens Boussole (`text-ink`, `text-ink-muted`, `bg-card`, `bg-paper`, `bg-tile`, `border-rule`, `text-accent`, `bg-seg`, `bg-emerald`, `text-strat-a`).
- Les modules `lib/` restent purs (aucun import React, aucun accès réseau) sauf `*-api.ts`, `hooks.ts` et `use-*.ts`.
- Aucune migration SQL dans ce chantier : ni table, ni vue, ni colonne.
- Commits en anglais, format `type(scope): message`, avec la ligne `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Tests : `npm run test` (Vitest 4). Vérification finale : `npx tsc --noEmit` puis `npm run build`.
- **Ne jamais lancer vitest avec `--update` ou `-u`** : `lib/simulator.test.ts` contient des snapshots de caractérisation d'un autre chantier.
- **Le rythme extrapolé ne porte que sur les dépenses variables.** Les engagements sont déjà déduits une fois dans le disponible ; les extrapoler les compterait deux fois et annoncerait un désastre systématique.

---

### Task 1: Module `pace.ts`

**Files:**
- Create: `lib/cockpit/pace.ts`
- Test: `lib/cockpit/pace.test.ts`

**Interfaces:**
- Consumes: rien — le module ne prend que des nombres et une date, pour rester trivialement testable.
- Produces:
  - `type MonthPace = { disponible: number; joursEcoules: number; joursRestants: number; parJour: number; rythmeVariable: number; finDeMois: number | null }`
  - `const PROJECTION_FROM_DAY = 8`
  - `function monthPace(input: { resteAVivre: number; pendingEngagements: number; variable: number; today: string }): MonthPace`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `lib/cockpit/pace.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { monthPace, PROJECTION_FROM_DAY } from "./pace";

const base = {
  resteAVivre: 1000,
  pendingEngagements: 0,
  variable: 0,
  today: "2026-08-15",
};

describe("disponible", () => {
  it("déduit les engagements attendus non encore prélevés", () => {
    const p = monthPace({ ...base, resteAVivre: 1000, pendingEngagements: 400 });
    expect(p.disponible).toBe(600);
  });

  it("égale le reste à vivre quand aucun engagement n'est en attente", () => {
    // Continuité avec le chiffre que le Cockpit affiche déjà.
    const p = monthPace({ ...base, resteAVivre: 1000, pendingEngagements: 0 });
    expect(p.disponible).toBe(1000);
  });

  it("peut être négatif quand le mois est déjà dépassé", () => {
    const p = monthPace({ ...base, resteAVivre: 100, pendingEngagements: 400 });
    expect(p.disponible).toBe(-300);
  });
});

describe("jours", () => {
  it("compte le jour courant dans les jours restants", () => {
    // Août a 31 jours ; le 28, il reste 28, 29, 30, 31.
    const p = monthPace({ ...base, today: "2026-08-28" });
    expect(p.joursEcoules).toBe(28);
    expect(p.joursRestants).toBe(4);
  });

  it("laisse un jour restant le dernier jour du mois", () => {
    const p = monthPace({ ...base, today: "2026-08-31" });
    expect(p.joursRestants).toBe(1);
  });

  it("s'adapte à un mois de 30 jours", () => {
    const p = monthPace({ ...base, today: "2026-04-10" });
    expect(p.joursRestants).toBe(21);
  });

  it("s'adapte à février", () => {
    const p = monthPace({ ...base, today: "2026-02-10" });
    expect(p.joursRestants).toBe(19);
  });

  it("s'adapte à un février bissextile", () => {
    const p = monthPace({ ...base, today: "2028-02-10" });
    expect(p.joursRestants).toBe(20);
  });
});

describe("parJour", () => {
  it("divise le disponible par les jours restants", () => {
    // Le 28 août : 4 jours restants, 600 € disponibles.
    const p = monthPace({
      ...base,
      resteAVivre: 1000,
      pendingEngagements: 400,
      today: "2026-08-28",
    });
    expect(p.parJour).toBeCloseTo(150);
  });

  it("est plancherisé à 0 quand le disponible est négatif", () => {
    const p = monthPace({ ...base, resteAVivre: 0, pendingEngagements: 300 });
    expect(p.parJour).toBe(0);
  });
});

describe("rythmeVariable", () => {
  it("divise les dépenses variables par les jours écoulés", () => {
    const p = monthPace({ ...base, variable: 300, today: "2026-08-10" });
    expect(p.rythmeVariable).toBeCloseTo(30);
  });

  it("vaut 0 sans dépense variable", () => {
    const p = monthPace({ ...base, variable: 0, today: "2026-08-10" });
    expect(p.rythmeVariable).toBe(0);
  });
});

describe("finDeMois", () => {
  it("n'est pas calculée avant le seuil", () => {
    for (let d = 1; d < PROJECTION_FROM_DAY; d++) {
      const day = String(d).padStart(2, "0");
      const p = monthPace({ ...base, variable: 100, today: `2026-08-${day}` });
      expect(p.finDeMois).toBeNull();
    }
  });

  it("est calculée à partir du seuil", () => {
    const p = monthPace({ ...base, variable: 100, today: "2026-08-08" });
    expect(p.finDeMois).not.toBeNull();
  });

  it("retranche le variable extrapolé sur les jours restants", () => {
    // Le 21 août : 21 jours écoulés, et 11 restants (21 au 31 inclus).
    // Variable 210 € → 10 €/jour. Disponible 1000 € → 1000 − 10 × 11 = 890 €.
    const p = monthPace({
      ...base,
      resteAVivre: 1000,
      pendingEngagements: 0,
      variable: 210,
      today: "2026-08-21",
    });
    expect(p.joursRestants).toBe(11);
    expect(p.finDeMois).toBeCloseTo(890);
  });

  it("n'extrapole pas les engagements, déjà déduits une fois", () => {
    // Deux cas au même rythme variable : un gros pendingEngagements doit
    // décaler la projection d'exactement son montant, jamais davantage.
    const sans = monthPace({
      ...base,
      resteAVivre: 1000,
      pendingEngagements: 0,
      variable: 210,
      today: "2026-08-21",
    });
    const avec = monthPace({
      ...base,
      resteAVivre: 1000,
      pendingEngagements: 500,
      variable: 210,
      today: "2026-08-21",
    });
    expect((sans.finDeMois as number) - (avec.finDeMois as number)).toBeCloseTo(500);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/cockpit/pace.test.ts`
Expected: FAIL — « Failed to resolve import "./pace" ».

- [ ] **Step 3: Écrire le module**

Créer `lib/cockpit/pace.ts` :

```ts
/**
 * Tenue du mois en cours : ce qu'il reste réellement, par jour, et où l'on
 * finira au rythme actuel.
 *
 * Le module ne prend que des nombres et une date : tout ce dont il a besoin est
 * déjà calculé par le Cockpit, et le garder ignorant des transactions le rend
 * trivialement testable.
 */
export type MonthPace = {
  /** Reste à vivre du mois moins les engagements attendus non encore prélevés. */
  disponible: number;
  joursEcoules: number;
  /** Inclut le jour courant : on peut encore dépenser aujourd'hui. */
  joursRestants: number;
  /** disponible / joursRestants, jamais négatif. */
  parJour: number;
  /** Dépenses variables du mois ÷ jours écoulés. */
  rythmeVariable: number;
  /** disponible − rythmeVariable × joursRestants ; null avant le seuil. */
  finDeMois: number | null;
};

/**
 * Jour du mois à partir duquel la projection est affichée.
 *
 * Avant, une seule grosse dépense multiplie par dix et annonce la ruine ; le
 * lendemain d'une journée calme, l'abondance. Une projection qui oscille ainsi
 * n'informe pas, et elle décrédibilise le disponible affiché juste à côté, qui
 * lui est un fait.
 */
export const PROJECTION_FROM_DAY = 8;

function daysInMonth(y: number, m: number): number {
  // Le jour 0 du mois suivant est le dernier jour du mois demandé.
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthPace(input: {
  resteAVivre: number;
  pendingEngagements: number;
  variable: number;
  today: string;
}): MonthPace {
  const [y, m, d] = input.today.split("-").map(Number);
  const total = daysInMonth(y, m);

  const joursEcoules = d;
  const joursRestants = total - d + 1;

  const disponible = input.resteAVivre - input.pendingEngagements;
  const parJour = disponible > 0 ? disponible / joursRestants : 0;
  const rythmeVariable = joursEcoules > 0 ? input.variable / joursEcoules : 0;

  const finDeMois =
    d >= PROJECTION_FROM_DAY
      ? disponible - rythmeVariable * joursRestants
      : null;

  return {
    disponible,
    joursEcoules,
    joursRestants,
    parJour,
    rythmeVariable,
    finDeMois,
  };
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run lib/cockpit/pace.test.ts`
Expected: PASS (16 tests).

Run: `npm run test` puis `npx tsc --noEmit`
Expected: PASS, aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/pace.ts lib/cockpit/pace.test.ts
git commit -m "feat(cockpit): month-pace computation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: La carte et son branchement

**Files:**
- Create: `components/cockpit/MonthPaceCard.tsx`
- Modify: `app/cockpit/page.tsx`

**Interfaces:**
- Consumes: `monthPace`, `MonthPace`, `PROJECTION_FROM_DAY` (Task 1) ; `metrics.resteAVivre` et `metrics.depenses`, `totals.pending` et `totals.variable`, `month` — tous déjà calculés dans `app/cockpit/page.tsx` ; `currentMonth` et `todayISO` (`lib/cockpit/format.ts`).
- Produces: rien.

- [ ] **Step 1: Écrire la carte**

Créer `components/cockpit/MonthPaceCard.tsx` :

```tsx
"use client";

import { CalendarClock } from "lucide-react";
import { eur } from "@/lib/cockpit/format";
import { PROJECTION_FROM_DAY, type MonthPace } from "@/lib/cockpit/pace";

export function MonthPaceCard({ pace }: { pace: MonthPace }) {
  const depasse = pace.disponible < 0;

  return (
    <div className="bg-card rounded-2xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <CalendarClock size={15} className="text-ink-muted" />
        <span className="text-[12.5px] font-bold">Tenue du mois</span>
      </div>

      <div
        className={`font-mono-num text-2xl ${
          depasse ? "text-accent" : "text-ink"
        }`}
      >
        {eur(pace.disponible)}
      </div>

      <div className="text-[12.5px] text-ink-muted mt-0.5">
        {depasse ? (
          <>
            Mois dépassé, engagements à venir déduits — il reste{" "}
            {pace.joursRestants} jour{pace.joursRestants > 1 ? "s" : ""}.
          </>
        ) : (
          <>
            disponible, soit{" "}
            <span className="font-mono-num text-ink">{eur(pace.parJour)}</span>{" "}
            par jour sur {pace.joursRestants} jour
            {pace.joursRestants > 1 ? "s" : ""}
          </>
        )}
      </div>

      <div className="text-[11.5px] text-ink-muted mt-2 pt-2 border-t border-rule">
        {pace.finDeMois === null ? (
          <>Estimation de fin de mois à partir du {PROJECTION_FROM_DAY}.</>
        ) : (
          <>
            Fin de mois estimée :{" "}
            <span className="font-mono-num">{eur(pace.finDeMois)}</span>
          </>
        )}
      </div>
    </div>
  );
}
```

Le disponible est le seul chiffre en gros : c'est un fait. Le budget journalier en est une
division, la projection une estimation — d'où la hiérarchie visuelle et le séparateur avant la
dernière ligne.

- [ ] **Step 2: Brancher la carte sur le Cockpit**

Dans `app/cockpit/page.tsx`, ajouter les imports :

```ts
import { MonthPaceCard } from "@/components/cockpit/MonthPaceCard";
import { monthPace } from "@/lib/cockpit/pace";
import { todayISO } from "@/lib/cockpit/format";
```

`currentMonth` est déjà importé depuis `@/lib/cockpit/format` dans ce fichier — le vérifier avant
de l'ajouter une seconde fois, et le signaler dans le rapport si ce n'est pas le cas.

Ajouter, à côté des autres `useMemo` (après celui qui calcule `totals`) :

```ts
  // « Est-ce que je tiens » n'a de sens que sur le mois en cours : un budget
  // journalier sur un mois clos serait absurde.
  const isCurrentMonth = month === currentMonth();
  const pace = useMemo(
    () =>
      monthPace({
        resteAVivre: metrics.resteAVivre,
        pendingEngagements: totals.pending,
        variable: totals.variable,
        today: todayISO(),
      }),
    [metrics.resteAVivre, totals.pending, totals.variable]
  );
```

Puis rendre la carte juste **après** le bloc `EngagementsBar`, dont elle prolonge la lecture :

```tsx
          {isCurrentMonth && <MonthPaceCard pace={pace} />}
```

- [ ] **Step 3: Vérifier**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

Run: `npm run test`
Expected: PASS, snapshots de `lib/simulator.test.ts` intacts.

Run: `npm run build`
Expected: build réussi.

- [ ] **Step 4: Commit**

```bash
git add components/cockpit/MonthPaceCard.tsx app/cockpit/page.tsx
git commit -m "feat(cockpit): month-pace card, current month only

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Smoke test manuel (à faire par l'utilisateur)**

1. `npm run dev`, ouvrir le Cockpit sur le mois en cours : la carte « Tenue du mois » apparaît sous
   la barre « Engagements & variable ».
2. Vérifier que le disponible vaut bien le reste à vivre du hero **moins** les engagements encore
   « à venir » listés dans la modale des engagements.
3. Naviguer vers un mois précédent : la carte disparaît.
4. Selon la date du jour, vérifier soit la projection, soit la mention « Estimation de fin de mois
   à partir du 8 ».

---

## Notes d'exécution

- **Ordre contraignant** : Task 1 avant Task 2.
- **Ne jamais lancer vitest avec `--update`** : `lib/simulator.test.ts` contient des snapshots de
  caractérisation d'un autre chantier.
- Aucune migration SQL dans ce chantier.
- Le module ne connaît ni transactions ni React : si une tâche a besoin d'y importer l'un ou
  l'autre, c'est que le calcul est au mauvais endroit.
