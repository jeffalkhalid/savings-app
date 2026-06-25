# Boussole Phase 1 — Reskin Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ré-habiller l'écran Cockpit sur le système Boussole (hero coloré selon mood + objectif, stat strip en cartes, « À noter », fixe/variable, catégories à tuiles, drill par catégorie + toutes-opérations avec recherche), iso-fonctionnel sur les données existantes.

**Architecture:** 4 modules purs testés (`mood`, `cockpit-notes`, `txn-filter`, `category-icon`) consommés par des composants restylés et un nouveau `OpsDrill`, orchestrés par `app/cockpit/page.tsx`. Aucun backend.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3 (tokens Boussole), Vitest, lucide-react.

## Global Constraints

- Aucun backend ; données via hooks existants (`useTransactions`, `useCategories`, `useMonthlyByCategory`, `useRecurring`).
- Objectif de taux **`GOAL = 0.2`** codé en dur (réglable Phase 2). Mood : `≥ goal` good « Au top » ; `≥ goal/2` ok « Bien » ; sinon watch « À surveiller ».
- Montants en `.font-mono-num` ; titres `.font-display`.
- Tokens disponibles : `paper, card, tile, seg, rule, ink, ink2, ink-muted, emerald, accent, gold, strat-a..f`. **Pas de modificateur d'opacité (`/NN`) sur les tokens en variables CSS** (`paper/card/tile/seg/rule/ink/ink2/ink-muted`) — l'opacité n'est valable que sur les hex (`accent`, `emerald`, `gold`, `white`).
- Texte sur fond coloré (hero, chips actives) : couleur littérale `text-[#FBF3EC]`.
- Budgets par catégorie hors périmètre (Phase 2).
- Vérif finale : `npm run test` vert, `npx tsc --noEmit` clean, `npm run build` OK.

---

## Task 1: `mood.ts` (TDD)

**Files:** Create `lib/cockpit/mood.ts`, `lib/cockpit/mood.test.ts`

**Interfaces:**
- Produces: `type MoodTone = "good" | "ok" | "watch"`; `type Mood = { label: string; progress: number; tone: MoodTone }`; `savingsMood(taux: number, goal: number): Mood`.

- [ ] **Step 1: Write the failing test** — `lib/cockpit/mood.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { savingsMood } from "./mood";

describe("savingsMood", () => {
  it("is 'good' at or above goal with progress capped at 1", () => {
    const m = savingsMood(0.25, 0.2);
    expect(m.tone).toBe("good");
    expect(m.label).toBe("Au top");
    expect(m.progress).toBe(1);
  });
  it("is 'ok' between half-goal and goal", () => {
    const m = savingsMood(0.12, 0.2);
    expect(m.tone).toBe("ok");
    expect(m.label).toBe("Bien");
  });
  it("is 'watch' below half goal", () => {
    const m = savingsMood(0.04, 0.2);
    expect(m.tone).toBe("watch");
    expect(m.label).toBe("À surveiller");
  });
  it("progress equals taux/goal", () => {
    expect(savingsMood(0.1, 0.2).progress).toBeCloseTo(0.5);
  });
  it("goal 0 yields progress 0", () => {
    expect(savingsMood(0.1, 0).progress).toBe(0);
  });
});
```

- [ ] **Step 2: Run** `npm run test -- mood` → FAIL (module not found).

- [ ] **Step 3: Implement** `lib/cockpit/mood.ts`:

```ts
export type MoodTone = "good" | "ok" | "watch";
export type Mood = { label: string; progress: number; tone: MoodTone };

export function savingsMood(taux: number, goal: number): Mood {
  const progress = goal > 0 ? Math.max(0, Math.min(1, taux / goal)) : 0;
  if (taux >= goal) return { label: "Au top", progress, tone: "good" };
  if (taux >= goal / 2) return { label: "Bien", progress, tone: "ok" };
  return { label: "À surveiller", progress, tone: "watch" };
}
```

- [ ] **Step 4: Run** `npm run test -- mood` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/mood.ts lib/cockpit/mood.test.ts
git commit -m "feat(cockpit): savingsMood pure module with tests"
```

---

## Task 2: `cockpit-notes.ts` (TDD)

**Files:** Create `lib/cockpit/cockpit-notes.ts`, `lib/cockpit/cockpit-notes.test.ts`

**Interfaces:**
- Consumes: `CategoryInsight` from `./categories-analysis` (`{ categoryId, name, total, nTxns, share, avgPrior, deltaPct }`); `Mood` from `./mood` (Task 1).
- Produces: `type Note = { icon: string; title: string; body: string; tone: Mood["tone"] }`; `buildNotes(insights: CategoryInsight[], mood: Mood): Note[]`.

- [ ] **Step 1: Write the failing test** — `lib/cockpit/cockpit-notes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildNotes } from "./cockpit-notes";
import type { CategoryInsight } from "./categories-analysis";
import type { Mood } from "./mood";

const mood: Mood = { label: "Bien", progress: 0.6, tone: "ok" };
const mk = (over: Partial<CategoryInsight>): CategoryInsight => ({
  categoryId: "x",
  name: "X",
  total: 100,
  nTxns: 1,
  share: 0.3,
  avgPrior: 0,
  deltaPct: null,
  ...over,
});

describe("buildNotes", () => {
  it("always includes the savings status card first", () => {
    const notes = buildNotes([], mood);
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe("Bien");
    expect(notes[0].tone).toBe("ok");
  });
  it("adds a rise card for the biggest increase", () => {
    const notes = buildNotes(
      [
        mk({ categoryId: "a", name: "Resto", share: 0.2, deltaPct: 0.4 }),
        mk({ categoryId: "b", name: "Courses", share: 0.5, deltaPct: 0.1 }),
      ],
      mood
    );
    const rise = notes.find((n) => n.icon === "📈");
    expect(rise?.title).toBe("Resto");
    expect(rise?.body).toContain("+40%");
  });
  it("adds a dominant-category card", () => {
    const notes = buildNotes(
      [mk({ categoryId: "b", name: "Courses", share: 0.5, deltaPct: null })],
      mood
    );
    const dom = notes.find((n) => n.icon === "📊");
    expect(dom?.title).toBe("Courses");
    expect(dom?.body).toContain("50%");
  });
  it("dedupes when the riser is also the dominant category", () => {
    const notes = buildNotes(
      [mk({ categoryId: "b", name: "Courses", share: 0.6, deltaPct: 0.3 })],
      mood
    );
    expect(notes.filter((n) => n.title === "Courses")).toHaveLength(1);
    expect(notes.length).toBeLessThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run** `npm run test -- cockpit-notes` → FAIL.

- [ ] **Step 3: Implement** `lib/cockpit/cockpit-notes.ts`:

```ts
import type { CategoryInsight } from "./categories-analysis";
import type { Mood } from "./mood";

export type Note = {
  icon: string;
  title: string;
  body: string;
  tone: Mood["tone"];
};

const STATUS_ICON: Record<Mood["tone"], string> = {
  good: "🌱",
  ok: "👍",
  watch: "⚠️",
};

export function buildNotes(insights: CategoryInsight[], mood: Mood): Note[] {
  const notes: Note[] = [
    {
      icon: STATUS_ICON[mood.tone],
      title: mood.label,
      body: "Ton taux d'épargne ce mois",
      tone: mood.tone,
    },
  ];
  const seen = new Set<string>();

  const risers = insights.filter(
    (i) => i.deltaPct !== null && (i.deltaPct as number) > 0
  );
  if (risers.length) {
    const top = risers.reduce((a, b) =>
      (b.deltaPct as number) > (a.deltaPct as number) ? b : a
    );
    notes.push({
      icon: "📈",
      title: top.name,
      body: `+${Math.round((top.deltaPct as number) * 100)}% vs ton habitude`,
      tone: "watch",
    });
    seen.add(top.name);
  }

  if (insights.length) {
    const dom = insights.reduce((a, b) => (b.share > a.share ? b : a));
    if (!seen.has(dom.name)) {
      notes.push({
        icon: "📊",
        title: dom.name,
        body: `${Math.round(dom.share * 100)}% de tes dépenses`,
        tone: "ok",
      });
    }
  }
  return notes.slice(0, 3);
}
```

- [ ] **Step 4: Run** `npm run test -- cockpit-notes` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/cockpit-notes.ts lib/cockpit/cockpit-notes.test.ts
git commit -m "feat(cockpit): buildNotes for 'À noter' cards with tests"
```

---

## Task 3: `txn-filter.ts` (TDD)

**Files:** Create `lib/cockpit/txn-filter.ts`, `lib/cockpit/txn-filter.test.ts`

**Interfaces:**
- Consumes: `Txn` from `./types`.
- Produces: `filterTxns(txns: Txn[], query: string, categoryId?: string | null): Txn[]`.

- [ ] **Step 1: Write the failing test** — `lib/cockpit/txn-filter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { filterTxns } from "./txn-filter";
import type { Txn } from "./types";

const t = (over: Partial<Txn>): Txn => ({
  id: "1",
  date: "2026-06-01",
  amount: -10,
  description: "X",
  type: "expense",
  category_id: "a",
  ...over,
});
const txns: Txn[] = [
  t({ id: "1", description: "Carrefour Market", category_id: "a" }),
  t({ id: "2", description: "Café de la gare", category_id: "b" }),
  t({ id: "3", description: "CARREFOUR City", category_id: "a" }),
];

describe("filterTxns", () => {
  it("matches description case- and accent-insensitively", () => {
    expect(filterTxns(txns, "carre").map((x) => x.id)).toEqual(["1", "3"]);
    expect(filterTxns(txns, "café").map((x) => x.id)).toEqual(["2"]);
    expect(filterTxns(txns, "cafe").map((x) => x.id)).toEqual(["2"]);
  });
  it("filters by category when provided", () => {
    expect(filterTxns(txns, "", "b").map((x) => x.id)).toEqual(["2"]);
  });
  it("empty query and no category returns all", () => {
    expect(filterTxns(txns, "")).toHaveLength(3);
  });
  it("treats 'all' or null as no category filter", () => {
    expect(filterTxns(txns, "", "all")).toHaveLength(3);
    expect(filterTxns(txns, "", null)).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run** `npm run test -- txn-filter` → FAIL.

- [ ] **Step 3: Implement** `lib/cockpit/txn-filter.ts` (the `.replace` strips combining accents — keep the regex as written):

```ts
import type { Txn } from "./types";

function normalize(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function filterTxns(
  txns: Txn[],
  query: string,
  categoryId?: string | null
): Txn[] {
  const q = normalize(query.trim());
  const cat = categoryId && categoryId !== "all" ? categoryId : null;
  return txns.filter((t) => {
    if (cat && t.category_id !== cat) return false;
    if (q && !normalize(t.description).includes(q)) return false;
    return true;
  });
}
```

- [ ] **Step 4: Run** `npm run test -- txn-filter` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/txn-filter.ts lib/cockpit/txn-filter.test.ts
git commit -m "feat(cockpit): filterTxns search/category helper with tests"
```

---

## Task 4: `category-icon.ts` (TDD)

**Files:** Create `lib/cockpit/category-icon.ts`, `lib/cockpit/category-icon.test.ts`

**Interfaces:**
- Produces: `categoryIcon(name: string): string`.

- [ ] **Step 1: Write the failing test** — `lib/cockpit/category-icon.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { categoryIcon } from "./category-icon";

describe("categoryIcon", () => {
  it("maps known categories", () => {
    expect(categoryIcon("Courses alimentaires")).toBe("🛒");
    expect(categoryIcon("Bourse / Natixis")).toBe("📈");
    expect(categoryIcon("Logement")).toBe("🏠");
  });
  it("is case- and accent-insensitive", () => {
    expect(categoryIcon("ÉNERGIE")).toBe("⚡");
  });
  it("falls back to a default", () => {
    expect(categoryIcon("Truc inconnu")).toBe("💳");
  });
});
```

- [ ] **Step 2: Run** `npm run test -- category-icon` → FAIL.

- [ ] **Step 3: Implement** `lib/cockpit/category-icon.ts`:

```ts
function normalize(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const RULES: { kw: string; icon: string }[] = [
  { kw: "salaire", icon: "💼" },
  { kw: "logement", icon: "🏠" },
  { kw: "course", icon: "🛒" },
  { kw: "restaurant", icon: "🍽️" },
  { kw: "transport", icon: "🚗" },
  { kw: "energie", icon: "⚡" },
  { kw: "telephon", icon: "📱" },
  { kw: "internet", icon: "📱" },
  { kw: "assurance", icon: "🛡️" },
  { kw: "sante", icon: "⚕️" },
  { kw: "loisir", icon: "🎬" },
  { kw: "vetement", icon: "👕" },
  { kw: "banc", icon: "🏦" },
  { kw: "virement", icon: "🔄" },
  { kw: "epargne", icon: "🐷" },
  { kw: "invest", icon: "📈" },
  { kw: "bourse", icon: "📈" },
  { kw: "natixis", icon: "📈" },
];

export function categoryIcon(name: string): string {
  const n = normalize(name);
  for (const r of RULES) if (n.includes(r.kw)) return r.icon;
  return "💳";
}
```

- [ ] **Step 4: Run** `npm run test -- category-icon` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/category-icon.ts lib/cockpit/category-icon.test.ts
git commit -m "feat(cockpit): categoryIcon emoji mapping with tests"
```

---

## Task 5: `HeroCard` (replaces `HeroBand`)

**Files:** Create `components/cockpit/HeroCard.tsx`; Delete `components/cockpit/HeroBand.tsx`

**Interfaces:**
- Consumes: `Mood` from `@/lib/cockpit/mood` (Task 1); `eur` from `@/lib/cockpit/format`.
- Produces: `HeroCard({ taux, reste, monthLabel, mood, goal })`.

- [ ] **Step 1: Create `components/cockpit/HeroCard.tsx`**

```tsx
import type { Mood } from "@/lib/cockpit/mood";
import { eur } from "@/lib/cockpit/format";

const TONE_BG: Record<Mood["tone"], string> = {
  good: "linear-gradient(135deg,#3E7D5A,#2D5F44)",
  ok: "linear-gradient(135deg,#E3B23C,#C98A2E)",
  watch: "linear-gradient(135deg,#C75B39,#A84527)",
};

export function HeroCard({
  taux,
  reste,
  monthLabel,
  mood,
  goal,
}: {
  taux: number;
  reste: number;
  monthLabel: string;
  mood: Mood;
  goal: number;
}) {
  const pct = Math.round(taux * 100);
  const goalPct = Math.round(goal * 100);
  return (
    <div
      className="rounded-[26px] p-6 text-[#FBF3EC] relative overflow-hidden mb-4"
      style={{ background: TONE_BG[mood.tone] }}
    >
      <div className="text-[11px] uppercase tracking-[0.12em] opacity-80 mb-2">
        Taux d&apos;épargne · {monthLabel}
      </div>
      <div className="flex items-baseline gap-3">
        <div className="font-display text-5xl leading-none">{pct}&thinsp;%</div>
        <div className="text-[13px] opacity-90">objectif {goalPct}&thinsp;%</div>
      </div>
      <div className="h-[7px] rounded-full bg-white/25 overflow-hidden my-4">
        <div
          className="h-full bg-white/90 rounded-full"
          style={{ width: `${Math.round(mood.progress * 100)}%` }}
        />
      </div>
      <div className="flex justify-between items-end">
        <div>
          <div className="text-[11px] uppercase tracking-[0.1em] opacity-80">
            Reste à vivre
          </div>
          <div className="font-mono-num text-2xl mt-0.5">{eur(reste)}</div>
        </div>
        <span className="rounded-full bg-white/20 px-3.5 py-1.5 text-[12px] font-semibold">
          {mood.label}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Delete the old `HeroBand`**

```bash
git rm components/cockpit/HeroBand.tsx
```

(It is only used by `app/cockpit/page.tsx`, which is rewritten in Task 9 to use `HeroCard`. A `tsc` run here would error on that stale import; that is expected and fixed in Task 9 — do not run tsc as the gate for this task.)

- [ ] **Step 3: Commit**

```bash
git add components/cockpit/HeroCard.tsx
git commit -m "feat(cockpit): HeroCard (mood gradient + goal progress), drop HeroBand"
```

---

## Task 6: Restyle `StatStrip` + new `InsightsRow`

**Files:** Modify `components/cockpit/StatStrip.tsx`; Create `components/cockpit/InsightsRow.tsx`

**Interfaces:**
- Consumes: `Metrics` from `@/lib/cockpit/metrics`; `eur`; `Note` from `@/lib/cockpit/cockpit-notes` (Task 2).
- Produces: `StatStrip({ metrics, onAllOps })`; `InsightsRow({ notes })`.

- [ ] **Step 1: Replace `components/cockpit/StatStrip.tsx`**

```tsx
import type { Metrics } from "@/lib/cockpit/metrics";
import { eur } from "@/lib/cockpit/format";

export function StatStrip({
  metrics,
  onAllOps,
}: {
  metrics: Metrics;
  onAllOps: () => void;
}) {
  return (
    <div className="flex gap-2.5 mb-4">
      <div className="flex-1 bg-card rounded-2xl p-3.5">
        <div className="text-[10px] uppercase tracking-[0.05em] text-ink-muted font-semibold">
          Revenus
        </div>
        <div className="font-mono-num text-sm mt-1 text-emerald">
          {eur(metrics.revenus)}
        </div>
      </div>
      <button
        type="button"
        onClick={onAllOps}
        className="flex-1 text-left bg-card rounded-2xl p-3.5"
      >
        <div className="text-[10px] uppercase tracking-[0.05em] text-ink-muted font-semibold">
          Dépenses
        </div>
        <div className="font-mono-num text-sm mt-1 text-accent">
          {eur(metrics.depenses)}
        </div>
      </button>
      <div className="flex-1 bg-card rounded-2xl p-3.5">
        <div className="text-[10px] uppercase tracking-[0.05em] text-ink-muted font-semibold">
          Épargne
        </div>
        <div className="font-mono-num text-sm mt-1 text-ink">
          {eur(metrics.epargne)}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `components/cockpit/InsightsRow.tsx`**

```tsx
import type { Note } from "@/lib/cockpit/cockpit-notes";

const TONE: Record<Note["tone"], string> = {
  good: "text-emerald",
  ok: "text-gold",
  watch: "text-accent",
};

export function InsightsRow({ notes }: { notes: Note[] }) {
  if (!notes.length) return null;
  return (
    <section className="mb-4">
      <div className="font-display text-[15px] mb-2">À noter</div>
      <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-5 px-5">
        {notes.map((n, i) => (
          <div key={i} className="shrink-0 w-44 bg-card rounded-2xl p-3.5">
            <div className={`text-xl ${TONE[n.tone]}`}>{n.icon}</div>
            <div className="text-[13px] font-bold mt-2">{n.title}</div>
            <div className="text-[12px] text-ink2 mt-0.5 leading-snug">
              {n.body}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/cockpit/StatStrip.tsx components/cockpit/InsightsRow.tsx
git commit -m "feat(cockpit): card StatStrip (Dépenses tappable) + InsightsRow"
```

---

## Task 7: Restyle `CategoryRow`, `CategoryBreakdown`, `FixedVariableBar`

**Files:** Modify `components/cockpit/CategoryRow.tsx`, `components/cockpit/CategoryBreakdown.tsx`, `components/cockpit/FixedVariableBar.tsx`

**Interfaces:**
- Consumes: `CategoryInsight`; `eur`; `categoryIcon` from `@/lib/cockpit/category-icon` (Task 4).
- Produces: `CategoryRow({ insight, icon, onClick })`; `CategoryBreakdown({ insights, onSelect })` (no `monthLabel`); `FixedVariableBar({ fixe, variable, fixedShare, onDrill })` (unchanged props).

- [ ] **Step 1: Replace `components/cockpit/CategoryRow.tsx`**

```tsx
import { eur } from "@/lib/cockpit/format";
import type { CategoryInsight } from "@/lib/cockpit/categories-analysis";

export function CategoryRow({
  insight,
  icon,
  onClick,
}: {
  insight: CategoryInsight;
  icon: string;
  onClick: () => void;
}) {
  const pct = Math.round(insight.share * 100);
  const trend =
    insight.deltaPct === null
      ? { text: "nouveau", cls: "text-ink-muted" }
      : insight.deltaPct > 0.05
        ? { text: `+${Math.round(insight.deltaPct * 100)}%`, cls: "text-accent" }
        : insight.deltaPct < -0.05
          ? { text: `${Math.round(insight.deltaPct * 100)}%`, cls: "text-emerald" }
          : { text: "stable", cls: "text-ink-muted" };

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 py-2.5"
    >
      <div className="w-9 h-9 rounded-xl bg-tile flex items-center justify-center text-[17px] shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline gap-2">
          <span className="text-sm truncate">{insight.name}</span>
          <span className="flex items-baseline gap-2 shrink-0">
            <span className="font-mono-num text-sm">−{eur(insight.total)}</span>
            <span className={`font-mono-num text-[11px] ${trend.cls}`}>
              {trend.text}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <div className="h-1.5 flex-1 rounded-full bg-rule overflow-hidden">
            <div
              className="h-full bg-accent/70"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="font-mono-num text-[11px] text-ink-muted w-9 text-right">
            {pct}%
          </span>
        </div>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Replace `components/cockpit/CategoryBreakdown.tsx`**

```tsx
import type { CategoryInsight } from "@/lib/cockpit/categories-analysis";
import { categoryIcon } from "@/lib/cockpit/category-icon";
import { CategoryRow } from "./CategoryRow";

export function CategoryBreakdown({
  insights,
  onSelect,
}: {
  insights: CategoryInsight[];
  onSelect: (categoryId: string) => void;
}) {
  return (
    <section>
      <div className="font-display text-[15px] mb-1">Par catégorie</div>
      {!insights.length && (
        <p className="text-ink-muted text-sm py-4">Aucune dépense ce mois.</p>
      )}
      {insights.map((i) => (
        <CategoryRow
          key={i.categoryId}
          insight={i}
          icon={categoryIcon(i.name)}
          onClick={() => onSelect(i.categoryId)}
        />
      ))}
    </section>
  );
}
```

- [ ] **Step 3: Replace `components/cockpit/FixedVariableBar.tsx`**

```tsx
import { eur } from "@/lib/cockpit/format";

export function FixedVariableBar({
  fixe,
  variable,
  fixedShare,
  onDrill,
}: {
  fixe: number;
  variable: number;
  fixedShare: number;
  onDrill: () => void;
}) {
  const pct = Math.round(fixedShare * 100);
  return (
    <button
      type="button"
      onClick={onDrill}
      className="w-full text-left bg-card rounded-2xl p-4 mb-4"
    >
      <div className="flex justify-between items-baseline mb-2.5">
        <span className="text-[12.5px] font-bold">Fixe &amp; variable</span>
        <span className="font-mono-num text-[11.5px] text-ink-muted">
          {eur(fixe)} · {eur(variable)}
        </span>
      </div>
      <div className="flex h-2.5 rounded-md overflow-hidden gap-[3px]">
        <div className="bg-emerald rounded-sm" style={{ width: `${pct}%` }} />
        <div className="bg-gold rounded-sm" style={{ width: `${100 - pct}%` }} />
      </div>
      <div className="flex gap-4 mt-2 text-[11px] text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald inline-block" />
          Fixe {pct}%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-gold inline-block" />
          Variable {100 - pct}%
        </span>
      </div>
    </button>
  );
}
```

- [ ] **Step 4: Type-check the components in isolation**

Run: `npx tsc --noEmit`
Expected: the only errors are in `app/cockpit/page.tsx` (still passes `monthLabel` to `CategoryBreakdown` and uses the old `CategoryRow`/`StatStrip` shapes) — fixed in Task 9. The three component files themselves are well-typed.

- [ ] **Step 5: Commit**

```bash
git add components/cockpit/CategoryRow.tsx components/cockpit/CategoryBreakdown.tsx components/cockpit/FixedVariableBar.tsx
git commit -m "feat(cockpit): tile CategoryRow + restyle breakdown & fixe/variable"
```

---

## Task 8: `OpsDrill`

**Files:** Create `components/cockpit/OpsDrill.tsx`

**Interfaces:**
- Consumes: `filterTxns` from `@/lib/cockpit/txn-filter` (Task 3); `eur`; `Txn`, `Category` from `@/lib/cockpit/types`.
- Produces: `OpsDrill({ mode, title, icon, txns, categories, query, onQuery, chip, onChip, onSelectTxn, onBack })`.

- [ ] **Step 1: Create `components/cockpit/OpsDrill.tsx`**

```tsx
import { eur } from "@/lib/cockpit/format";
import { filterTxns } from "@/lib/cockpit/txn-filter";
import type { Txn, Category } from "@/lib/cockpit/types";

export function OpsDrill({
  mode,
  title,
  icon,
  txns,
  categories,
  query,
  onQuery,
  chip,
  onChip,
  onSelectTxn,
  onBack,
}: {
  mode: "category" | "all";
  title: string;
  icon: string;
  txns: Txn[];
  categories: Category[];
  query: string;
  onQuery: (q: string) => void;
  chip: string | null;
  onChip: (id: string | null) => void;
  onSelectTxn: (t: Txn) => void;
  onBack: () => void;
}) {
  const shown = filterTxns(txns, query, mode === "all" ? chip : null);
  const total = shown.reduce((a, t) => a + Math.abs(Number(t.amount)), 0);
  const chipCats = categories.filter((c) =>
    txns.some((t) => t.category_id === c.id)
  );
  const fmtDate = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
    });

  const chipCls = (active: boolean) =>
    `shrink-0 rounded-full px-3 py-1.5 text-[12px] ${
      active ? "bg-accent text-[#FBF3EC]" : "bg-seg text-ink-muted"
    }`;

  return (
    <section className="pt-1">
      <button
        type="button"
        onClick={onBack}
        className="text-ink-muted text-sm mb-3"
      >
        ‹ Retour
      </button>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-tile flex items-center justify-center text-lg">
          {icon}
        </div>
        <div>
          <div className="font-display text-lg">{title}</div>
          <div className="text-xs text-ink-muted">
            {shown.length} opérations · {eur(total)}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-card rounded-xl px-3.5 mb-3">
        <input
          type="text"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Rechercher une opération…"
          className="flex-1 bg-transparent outline-none text-sm py-3 text-ink"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQuery("")}
            className="text-ink-muted text-base"
          >
            ×
          </button>
        )}
      </div>

      {mode === "all" && chipCats.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2.5 mb-1">
          <button type="button" onClick={() => onChip(null)} className={chipCls(chip === null)}>
            Tout
          </button>
          {chipCats.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onChip(c.id)}
              className={chipCls(chip === c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {shown.map((t) => {
        const amt = Number(t.amount);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelectTxn(t)}
            className="w-full text-left flex justify-between items-center gap-2.5 py-2.5 border-b border-rule"
          >
            <div className="min-w-0">
              <div className="text-sm truncate">{t.description}</div>
              <div className="text-[11.5px] text-ink-muted mt-0.5">
                {fmtDate(t.date)}
              </div>
            </div>
            <span
              className={`font-mono-num text-sm shrink-0 ${
                amt < 0 ? "text-accent" : "text-emerald"
              }`}
            >
              {eur(amt)}
            </span>
          </button>
        );
      })}

      {!shown.length && (
        <div className="text-center py-8 text-ink-muted">
          <div className="text-3xl mb-1.5">🔍</div>
          <div className="text-sm font-semibold text-ink">Aucune opération</div>
          <div className="text-xs mt-0.5">
            Essaie un autre mot{mode === "all" ? " ou une autre catégorie" : ""}.
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: errors remain only in `app/cockpit/page.tsx` (fixed in Task 9); `OpsDrill.tsx` itself is well-typed.

- [ ] **Step 3: Commit**

```bash
git add components/cockpit/OpsDrill.tsx
git commit -m "feat(cockpit): OpsDrill (category + all-ops, search + chips)"
```

---

## Task 9: Wire the Cockpit page

**Files:** Modify (full rewrite) `app/cockpit/page.tsx`

**Interfaces:**
- Consumes: `HeroCard` (Task 5), `StatStrip`/`InsightsRow` (Task 6), `CategoryBreakdown`/`FixedVariableBar` (Task 7), `OpsDrill` (Task 8), `savingsMood` (Task 1), `buildNotes` (Task 2), `categoryIcon` (Task 4); existing `TransferNudge`, `TransferTriage`, `FixedChargesList`, `ThemeToggle`, `MonthSwitcher`, `Fab`, `TxnModal`, hooks, `updateTransaction`, `ensureTransferCategories`, `classifyAllTransfers`.
- Produces: wired Cockpit.

- [ ] **Step 1: Replace the entire contents of `app/cockpit/page.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  useAuth,
  useTransactions,
  useCategories,
  useAccounts,
  useMonthlyByCategory,
  useRecurring,
} from "@/lib/cockpit/hooks";
import { computeMetrics } from "@/lib/cockpit/metrics";
import { analyzeCategories } from "@/lib/cockpit/categories-analysis";
import { monthlyFixedTotal, fixedVariableSplit } from "@/lib/cockpit/fixed";
import { pendingTransfers } from "@/lib/cockpit/transfers";
import {
  ensureTransferCategories,
  classifyAllTransfers,
} from "@/lib/cockpit/transfers-api";
import { savingsMood } from "@/lib/cockpit/mood";
import { buildNotes } from "@/lib/cockpit/cockpit-notes";
import { categoryIcon } from "@/lib/cockpit/category-icon";
import { currentMonth } from "@/lib/cockpit/format";
import { supabase } from "@/lib/cockpit/supabase";
import { updateTransaction } from "@/lib/cockpit/transactions-api";
import type { Txn } from "@/lib/cockpit/types";
import { MonthSwitcher } from "@/components/cockpit/MonthSwitcher";
import { HeroCard } from "@/components/cockpit/HeroCard";
import { StatStrip } from "@/components/cockpit/StatStrip";
import { InsightsRow } from "@/components/cockpit/InsightsRow";
import { CategoryBreakdown } from "@/components/cockpit/CategoryBreakdown";
import { FixedVariableBar } from "@/components/cockpit/FixedVariableBar";
import { FixedChargesList } from "@/components/cockpit/FixedChargesList";
import { TransferTriage } from "@/components/cockpit/TransferTriage";
import { TransferNudge } from "@/components/cockpit/TransferNudge";
import { OpsDrill } from "@/components/cockpit/OpsDrill";
import { ThemeToggle } from "@/components/cockpit/ThemeToggle";
import { Fab } from "@/components/cockpit/Fab";
import { TxnModal } from "@/components/cockpit/TxnModal";

const GOAL = 0.2;
const monthLabelOf = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

type Drill = null | { kind: "category"; id: string } | { kind: "all" };

export default function DashboardPage() {
  const user = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const [showAdd, setShowAdd] = useState(false);
  const [editTxn, setEditTxn] = useState<Txn | null>(null);
  const [drill, setDrill] = useState<Drill>(null);
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<string | null>(null);
  const [showFixed, setShowFixed] = useState(false);
  const [showTransfers, setShowTransfers] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [classifying, setClassifying] = useState(false);

  const { txns, refetch } = useTransactions(month);
  const { categories } = useCategories();
  const { accounts } = useAccounts();
  const { rows: monthlyByCat, error: catError } = useMonthlyByCategory(user.id);
  const { recurring } = useRecurring(user.id);

  const metrics = useMemo(() => computeMetrics(txns), [txns]);
  const insights = useMemo(
    () => analyzeCategories(monthlyByCat, month, categories),
    [monthlyByCat, month, categories]
  );
  const fixedTotal = useMemo(() => monthlyFixedTotal(recurring), [recurring]);
  const split = useMemo(
    () => fixedVariableSplit(metrics.depenses, fixedTotal),
    [metrics.depenses, fixedTotal]
  );
  const transfers = useMemo(() => pendingTransfers(txns), [txns]);
  const mood = useMemo(
    () => savingsMood(metrics.tauxEpargne, GOAL),
    [metrics.tauxEpargne]
  );
  const notes = useMemo(() => buildNotes(insights, mood), [insights, mood]);
  const label = monthLabelOf(month);

  const expenseTxns = useMemo(
    () => txns.filter((t) => t.type === "expense"),
    [txns]
  );
  const drillCat =
    drill?.kind === "category"
      ? categories.find((c) => c.id === drill.id)
      : null;
  const drillTxns =
    drill?.kind === "category"
      ? txns.filter((t) => t.category_id === drill.id)
      : expenseTxns;

  const changeMonth = (m: string) => {
    setMonth(m);
    setDrill(null);
    setQuery("");
    setChip(null);
    setShowFixed(false);
    setShowTransfers(false);
  };
  const openCategory = (id: string) => {
    setDrill({ kind: "category", id });
    setQuery("");
  };
  const openAllOps = () => {
    setDrill({ kind: "all" });
    setQuery("");
    setChip(null);
  };

  const reclassify = async (txn: Txn, categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return;
    setTransferError(null);
    try {
      await updateTransaction(txn.id, {
        date: txn.date,
        absAmount: Math.abs(Number(txn.amount)),
        description: txn.description,
        categoryId,
        categoryName: cat.name,
        accountId: txn.account_id ?? "",
        categoryType: cat.type,
      });
      refetch();
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : "Erreur");
    }
  };
  const autoClassify = async () => {
    setClassifying(true);
    setTransferError(null);
    try {
      const cats = await ensureTransferCategories(user.id, categories);
      await classifyAllTransfers(txns, cats);
      refetch();
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : "Erreur");
    }
    setClassifying(false);
  };

  return (
    <main className="max-w-[600px] mx-auto px-5 pt-8">
      <header className="flex justify-between items-center mb-6">
        <h1 className="font-display text-2xl">Cockpit</h1>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <MonthSwitcher month={month} onChange={changeMonth} />
          <Link href="/cockpit/import" className="text-ink-muted text-sm">
            Import
          </Link>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-ink-muted text-sm"
          >
            Déco
          </button>
        </div>
      </header>

      <HeroCard
        taux={metrics.tauxEpargne}
        reste={metrics.resteAVivre}
        monthLabel={label}
        mood={mood}
        goal={GOAL}
      />
      <StatStrip metrics={metrics} onAllOps={openAllOps} />

      {showTransfers ? (
        <>
          {transferError && (
            <p className="text-accent text-sm mb-2">{transferError}</p>
          )}
          <TransferTriage
            transfers={transfers}
            categories={categories}
            onReclassify={reclassify}
            onBack={() => setShowTransfers(false)}
          />
        </>
      ) : showFixed ? (
        <FixedChargesList
          recurring={recurring}
          categories={categories}
          onBack={() => setShowFixed(false)}
        />
      ) : drill ? (
        <OpsDrill
          mode={drill.kind === "all" ? "all" : "category"}
          title={drill.kind === "all" ? "Toutes les dépenses" : drillCat?.name ?? ""}
          icon={drill.kind === "all" ? "💸" : categoryIcon(drillCat?.name ?? "")}
          txns={drillTxns}
          categories={categories}
          query={query}
          onQuery={setQuery}
          chip={chip}
          onChip={setChip}
          onSelectTxn={setEditTxn}
          onBack={() => setDrill(null)}
        />
      ) : (
        <>
          {transferError && (
            <p className="text-accent text-sm mb-2">{transferError}</p>
          )}
          <TransferNudge
            count={transfers.length}
            onAuto={autoClassify}
            onManual={() => {
              setTransferError(null);
              setShowTransfers(true);
            }}
            busy={classifying}
          />
          <InsightsRow notes={notes} />
          {fixedTotal > 0 && (
            <FixedVariableBar
              fixe={split.fixe}
              variable={split.variable}
              fixedShare={split.fixedShare}
              onDrill={() => setShowFixed(true)}
            />
          )}
          {catError && (
            <p className="text-ink-muted text-xs mb-2">
              Répartition indisponible — réessaie plus tard.
            </p>
          )}
          <CategoryBreakdown insights={insights} onSelect={openCategory} />
        </>
      )}

      <Fab onClick={() => setShowAdd(true)} label="Ajouter une transaction" />

      {showAdd && (
        <TxnModal
          userId={user.id}
          categories={categories}
          accounts={accounts}
          txn={null}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            refetch();
            setShowAdd(false);
          }}
        />
      )}

      {editTxn && (
        <TxnModal
          userId={user.id}
          categories={categories}
          accounts={accounts}
          txn={editTxn}
          onClose={() => setEditTxn(null)}
          onSaved={() => {
            refetch();
            setEditTxn(null);
          }}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors (the whole Cockpit now uses the new component shapes).

- [ ] **Step 3: Commit**

```bash
git add app/cockpit/page.tsx
git commit -m "feat(cockpit): wire HeroCard/Insights/OpsDrill into the dashboard"
```

---

## Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite** — Run `npm run test` → PASS (incl. `mood`, `cockpit-notes`, `txn-filter`, `category-icon`).
- [ ] **Step 2: Type-check** — Run `npx tsc --noEmit` → no errors.
- [ ] **Step 3: Build** — Run `npm run build` → succeeds; `/cockpit` present.
- [ ] **Step 4: Manual smoke (`npm run dev`)** — log in, on a month with data:
  1. Hero card colored per mood (green ≥20 % / gold 10–20 % / terracotta <10 %), big taux %, progress bar toward 20 %, reste à vivre in mono, mood badge.
  2. Stat strip = 3 cards; tapping **Dépenses** opens "Toutes les dépenses" with search + category chips; filtering by chip and by text both work; tapping an op opens the edit modal.
  3. Tapping a category row opens that category's ops with search; empty search shows the "Aucune opération" state.
  4. "À noter" shows the status card (+ rise/dominant when applicable); horizontal scroll works.
  5. Fixe/variable card and the transfer nudge still work; month switch resets drill/search.
  6. Everything legible in light and dark.
- [ ] **Step 5: Final commit (only if tweaks needed)**

```bash
git add -A
git commit -m "chore(cockpit): Phase 1 verification fixes"
```

---

## Self-review notes

- **Spec coverage:** mood/notes/txn-filter/category-icon (Tasks 1–4) ; HeroCard (5) ; StatStrip+InsightsRow (6) ; CategoryRow/Breakdown/FixedVariableBar (7) ; OpsDrill (8) ; page integration incl. nudge/triage/edit/month-reset (9) ; verification incl. light+dark (10). All spec sections covered.
- **Placeholder scan:** none; full code in every step.
- **Type consistency:** `Mood`/`savingsMood` (1) used by `cockpit-notes` (2) and `HeroCard` (5)/page (9) ; `Note` (2) used by `InsightsRow` (6) ; `filterTxns` (3) used by `OpsDrill` (8) ; `categoryIcon` (4) used by `CategoryBreakdown` (7) + page (9) ; `CategoryBreakdown` drops `monthLabel`, `StatStrip` gains `onAllOps`, `CategoryRow` gains `icon` — all reflected in the page (9).
- **Tailwind opacity caveat:** opacity modifiers used only on hex/white tokens (`bg-accent/70`, `bg-white/25`, `bg-white/90`, `bg-white/20`); var-based tokens use solid classes. Documented in Global Constraints.
- **Branch note:** continues `boussole-redesign`.
