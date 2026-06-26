# Boussole Phase 1 — Patrimoine + icônes premium Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer les icônes emoji par des icônes lucide premium dans tout le Cockpit, et ré-habiller l'écran Patrimoine au look Boussole (iso-fonctionnel).

**Architecture:** Helpers d'icônes (`category-icon`, `asset-icon`) renvoient un `LucideIcon` ; `cockpit-notes` porte un `kind` mappé en lucide côté UI ; composants rendent `<Icon/>`. Patrimoine : hero vert + graphe restylé + répartition + liste d'actifs à tuiles. Aucun backend.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3 (tokens Boussole), recharts, lucide-react, Vitest.

## Global Constraints

- Aucun emoji dans l'UI : tout en `lucide-react` (déjà dépendance). Helpers renvoient `LucideIcon` ; consommateurs rendent `<Icon size={…} className="…" />`.
- Tokens : `paper, card, tile, seg, rule, ink, ink2, ink-muted, emerald, accent, gold`. Opacité (`/NN`) seulement sur hex/white (`accent`, `emerald`, `gold`, `white`), jamais sur les tokens variables.
- Texte sur fond coloré : `text-[#FBF3EC]`.
- Montants en `.font-mono-num` ; titres de section `.font-display text-[15px]`.
- recharts exige des couleurs littérales (pas de classes) : utiliser `#3E7D5A` / `#9A8E7C`.
- Reporté Phase 2 : multi-devises, allocation cible. Modales conservées.
- Vérif finale : `npm run test` vert, `npx tsc --noEmit` clean, `npm run build` OK.

---

## Task 1: Rework `category-icon.ts` → lucide

**Files:** Modify `lib/cockpit/category-icon.ts`, `lib/cockpit/category-icon.test.ts`

**Interfaces:**
- Produces: `categoryIcon(name: string): LucideIcon` (au lieu de `string`).

- [ ] **Step 1: Update the test** — replace `lib/cockpit/category-icon.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { categoryIcon } from "./category-icon";
import { ShoppingCart, TrendingUp, Home, Zap, CreditCard } from "lucide-react";

describe("categoryIcon", () => {
  it("maps known categories to lucide icons", () => {
    expect(categoryIcon("Courses alimentaires")).toBe(ShoppingCart);
    expect(categoryIcon("Bourse / Natixis")).toBe(TrendingUp);
    expect(categoryIcon("Logement")).toBe(Home);
  });
  it("is case- and accent-insensitive", () => {
    expect(categoryIcon("ÉNERGIE")).toBe(Zap);
  });
  it("falls back to a default", () => {
    expect(categoryIcon("Truc inconnu")).toBe(CreditCard);
  });
});
```

- [ ] **Step 2: Run** `npm run test -- category-icon` → FAIL (returns emoji string, not the component).

- [ ] **Step 3: Replace** `lib/cockpit/category-icon.ts`:

```ts
import {
  Briefcase,
  Home,
  ShoppingCart,
  UtensilsCrossed,
  Car,
  Zap,
  Smartphone,
  Shield,
  HeartPulse,
  Clapperboard,
  Shirt,
  Landmark,
  ArrowLeftRight,
  PiggyBank,
  TrendingUp,
  CreditCard,
  type LucideIcon,
} from "lucide-react";

function normalize(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const RULES: { kw: string; icon: LucideIcon }[] = [
  { kw: "salaire", icon: Briefcase },
  { kw: "logement", icon: Home },
  { kw: "course", icon: ShoppingCart },
  { kw: "restaurant", icon: UtensilsCrossed },
  { kw: "transport", icon: Car },
  { kw: "energie", icon: Zap },
  { kw: "telephon", icon: Smartphone },
  { kw: "internet", icon: Smartphone },
  { kw: "assurance", icon: Shield },
  { kw: "sante", icon: HeartPulse },
  { kw: "loisir", icon: Clapperboard },
  { kw: "vetement", icon: Shirt },
  { kw: "banc", icon: Landmark },
  { kw: "virement", icon: ArrowLeftRight },
  { kw: "epargne", icon: PiggyBank },
  { kw: "invest", icon: TrendingUp },
  { kw: "bourse", icon: TrendingUp },
  { kw: "natixis", icon: TrendingUp },
];

export function categoryIcon(name: string): LucideIcon {
  const n = normalize(name);
  for (const r of RULES) if (n.includes(r.kw)) return r.icon;
  return CreditCard;
}
```

- [ ] **Step 4: Run** `npm run test -- category-icon` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/category-icon.ts lib/cockpit/category-icon.test.ts
git commit -m "feat(cockpit): categoryIcon returns lucide icons (no emoji)"
```

---

## Task 2: New `asset-icon.ts` (TDD)

**Files:** Create `lib/cockpit/asset-icon.ts`, `lib/cockpit/asset-icon.test.ts`

**Interfaces:**
- Produces: `assetIcon(type: string): LucideIcon`.

- [ ] **Step 1: Write the failing test** — `lib/cockpit/asset-icon.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { assetIcon } from "./asset-icon";
import { TrendingUp, PiggyBank, Banknote, Coins, CreditCard } from "lucide-react";

describe("assetIcon", () => {
  it("maps asset types to lucide icons", () => {
    expect(assetIcon("stock")).toBe(TrendingUp);
    expect(assetIcon("savings")).toBe(PiggyBank);
    expect(assetIcon("cash")).toBe(Banknote);
    expect(assetIcon("commodity")).toBe(Coins);
  });
  it("is case-insensitive and falls back", () => {
    expect(assetIcon("STOCK")).toBe(TrendingUp);
    expect(assetIcon("inconnu")).toBe(CreditCard);
  });
});
```

- [ ] **Step 2: Run** `npm run test -- asset-icon` → FAIL.

- [ ] **Step 3: Implement** `lib/cockpit/asset-icon.ts`:

```ts
import {
  TrendingUp,
  PiggyBank,
  Banknote,
  Coins,
  CreditCard,
  type LucideIcon,
} from "lucide-react";

function normalize(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const RULES: { kw: string; icon: LucideIcon }[] = [
  { kw: "stock", icon: TrendingUp },
  { kw: "action", icon: TrendingUp },
  { kw: "invest", icon: TrendingUp },
  { kw: "saving", icon: PiggyBank },
  { kw: "livret", icon: PiggyBank },
  { kw: "cash", icon: Banknote },
  { kw: "liquid", icon: Banknote },
  { kw: "commodity", icon: Coins },
];

export function assetIcon(type: string): LucideIcon {
  const n = normalize(type);
  for (const r of RULES) if (n.includes(r.kw)) return r.icon;
  return CreditCard;
}
```

- [ ] **Step 4: Run** `npm run test -- asset-icon` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/asset-icon.ts lib/cockpit/asset-icon.test.ts
git commit -m "feat(patrimoine): assetIcon lucide mapping with tests"
```

---

## Task 3: Rework `cockpit-notes.ts` → `kind`

**Files:** Modify `lib/cockpit/cockpit-notes.ts`, `lib/cockpit/cockpit-notes.test.ts`

**Interfaces:**
- Produces: `type Note = { kind: "status" | "rise" | "dominant"; title: string; body: string; tone: Mood["tone"] }`; `buildNotes(insights, mood): Note[]` (unchanged behaviour, `kind` instead of emoji `icon`).

- [ ] **Step 1: Update the test** — in `lib/cockpit/cockpit-notes.test.ts`, replace the emoji assertions. Replace the whole file with:

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
    expect(notes[0].kind).toBe("status");
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
    const rise = notes.find((n) => n.kind === "rise");
    expect(rise?.title).toBe("Resto");
    expect(rise?.body).toContain("+40%");
  });
  it("adds a dominant-category card", () => {
    const notes = buildNotes(
      [mk({ categoryId: "b", name: "Courses", share: 0.5, deltaPct: null })],
      mood
    );
    const dom = notes.find((n) => n.kind === "dominant");
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

- [ ] **Step 2: Run** `npm run test -- cockpit-notes` → FAIL (`kind` undefined).

- [ ] **Step 3: Replace** `lib/cockpit/cockpit-notes.ts`:

```ts
import type { CategoryInsight } from "./categories-analysis";
import type { Mood } from "./mood";

export type Note = {
  kind: "status" | "rise" | "dominant";
  title: string;
  body: string;
  tone: Mood["tone"];
};

export function buildNotes(insights: CategoryInsight[], mood: Mood): Note[] {
  const notes: Note[] = [
    {
      kind: "status",
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
      kind: "rise",
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
        kind: "dominant",
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
git commit -m "feat(cockpit): notes carry a kind (lucide-rendered) instead of emoji"
```

---

## Task 4: Update Cockpit consumers to lucide

**Files:** Modify `components/cockpit/CategoryRow.tsx`, `components/cockpit/CategoryBreakdown.tsx`, `components/cockpit/InsightsRow.tsx`, `components/cockpit/OpsDrill.tsx`, `app/cockpit/page.tsx`

**Interfaces:**
- Consumes: `categoryIcon` (Task 1, `LucideIcon`); `Note.kind` (Task 3); `LucideIcon` type.
- Produces: `CategoryRow({ insight, Icon, onClick })`; `OpsDrill({ …, Icon, … })` (prop `icon: string` → `Icon: LucideIcon`).

- [ ] **Step 1: Replace `components/cockpit/CategoryRow.tsx`**

```tsx
import { eur } from "@/lib/cockpit/format";
import type { CategoryInsight } from "@/lib/cockpit/categories-analysis";
import type { LucideIcon } from "lucide-react";

export function CategoryRow({
  insight,
  Icon,
  onClick,
}: {
  insight: CategoryInsight;
  Icon: LucideIcon;
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
      <div className="w-9 h-9 rounded-xl bg-tile flex items-center justify-center shrink-0">
        <Icon size={17} className="text-ink2" />
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
            <div className="h-full bg-accent/70" style={{ width: `${pct}%` }} />
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
          Icon={categoryIcon(i.name)}
          onClick={() => onSelect(i.categoryId)}
        />
      ))}
    </section>
  );
}
```

- [ ] **Step 3: Replace `components/cockpit/InsightsRow.tsx`**

```tsx
import type { Note } from "@/lib/cockpit/cockpit-notes";
import {
  Sprout,
  ThumbsUp,
  TriangleAlert,
  TrendingUp,
  PieChart,
  type LucideIcon,
} from "lucide-react";

const TONE: Record<Note["tone"], string> = {
  good: "text-emerald",
  ok: "text-gold",
  watch: "text-accent",
};

const STATUS_ICON: Record<Note["tone"], LucideIcon> = {
  good: Sprout,
  ok: ThumbsUp,
  watch: TriangleAlert,
};

function noteIcon(n: Note): LucideIcon {
  if (n.kind === "rise") return TrendingUp;
  if (n.kind === "dominant") return PieChart;
  return STATUS_ICON[n.tone];
}

export function InsightsRow({ notes }: { notes: Note[] }) {
  if (!notes.length) return null;
  return (
    <section className="mb-4">
      <div className="font-display text-[15px] mb-2">À noter</div>
      <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-5 px-5">
        {notes.map((n, i) => {
          const Icon = noteIcon(n);
          return (
            <div key={i} className="shrink-0 w-44 bg-card rounded-2xl p-3.5">
              <Icon size={20} className={TONE[n.tone]} />
              <div className="text-[13px] font-bold mt-2">{n.title}</div>
              <div className="text-[12px] text-ink2 mt-0.5 leading-snug">
                {n.body}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Replace `components/cockpit/OpsDrill.tsx`** (header tile + empty state now lucide; prop `icon: string` → `Icon: LucideIcon`)

```tsx
import { eur } from "@/lib/cockpit/format";
import { filterTxns } from "@/lib/cockpit/txn-filter";
import type { Txn, Category } from "@/lib/cockpit/types";
import { SearchX, type LucideIcon } from "lucide-react";

export function OpsDrill({
  mode,
  title,
  Icon,
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
  Icon: LucideIcon;
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
        <div className="w-10 h-10 rounded-xl bg-tile flex items-center justify-center">
          <Icon size={20} className="text-ink2" />
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
          <SearchX size={28} className="mx-auto mb-1.5" />
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

- [ ] **Step 5: Update `app/cockpit/page.tsx`** — add the `Wallet` import and switch `OpsDrill`'s `icon` prop to `Icon`.

Add this import line (near the other imports):
```tsx
import { Wallet } from "lucide-react";
```
Then replace this line inside the `<OpsDrill … />`:
```tsx
          icon={drill.kind === "all" ? "💸" : categoryIcon(drillCat?.name ?? "")}
```
with:
```tsx
          Icon={drill.kind === "all" ? Wallet : categoryIcon(drillCat?.name ?? "")}
```
(`categoryIcon` is already imported and now returns a `LucideIcon`.)

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add components/cockpit/CategoryRow.tsx components/cockpit/CategoryBreakdown.tsx components/cockpit/InsightsRow.tsx components/cockpit/OpsDrill.tsx app/cockpit/page.tsx
git commit -m "feat(cockpit): render lucide icons in rows, insights, drill"
```

---

## Task 5: Restyle `PatrimoineHero`

**Files:** Modify `components/cockpit/patrimoine/PatrimoineHero.tsx`

**Interfaces:**
- Produces: `PatrimoineHero({ total, delta, count })` (new `count: number`).

- [ ] **Step 1: Replace `components/cockpit/patrimoine/PatrimoineHero.tsx`**

```tsx
import { eur } from "@/lib/cockpit/format";

export function PatrimoineHero({
  total,
  delta,
  count,
}: {
  total: number;
  delta: number | null;
  count: number;
}) {
  return (
    <div
      className="rounded-[26px] p-6 text-[#FBF3EC] relative overflow-hidden mb-4"
      style={{ background: "linear-gradient(135deg,#3E7D5A,#2D5F44)" }}
    >
      <div className="text-[11px] uppercase tracking-[0.12em] opacity-80 mb-2">
        Patrimoine total
      </div>
      <div className="font-display text-4xl leading-none">{eur(total)}</div>
      <div className="flex flex-wrap gap-2 mt-4">
        {delta !== null && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.16] px-3 py-1.5 text-[12px] font-semibold">
            {delta >= 0 ? "▲" : "▼"} {eur(Math.abs(delta))} ce mois
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.16] px-3 py-1.5 text-[12px] font-semibold">
          {count} actif{count > 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit** (tsc gate deferred to Task 9, where the page passes `count`)

```bash
git add components/cockpit/patrimoine/PatrimoineHero.tsx
git commit -m "feat(patrimoine): green HeroCard (total + delta + asset count)"
```

---

## Task 6: Restyle `PatrimoineChart`

**Files:** Modify `components/cockpit/patrimoine/PatrimoineChart.tsx`

- [ ] **Step 1: Replace `components/cockpit/patrimoine/PatrimoineChart.tsx`**

```tsx
"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { eur } from "@/lib/cockpit/format";

export function PatrimoineChart({
  series,
}: {
  series: { date: string; total: number }[];
}) {
  if (series.length < 2) {
    return (
      <div className="bg-card rounded-2xl p-5 mb-4 text-ink-muted text-sm text-center">
        Pas encore assez d&apos;historique pour tracer une courbe.
      </div>
    );
  }
  return (
    <div className="bg-card rounded-2xl p-4 mb-4">
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={series}
            margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
          >
            <defs>
              <linearGradient id="patGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3E7D5A" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#3E7D5A" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#9A8E7C" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis hide />
            <Tooltip formatter={(v: number) => eur(v)} />
            <Area
              type="monotone"
              dataKey="total"
              stroke="#3E7D5A"
              strokeWidth={2.5}
              fill="url(#patGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check** — Run `npx tsc --noEmit` → no errors (props unchanged).

- [ ] **Step 3: Commit**

```bash
git add components/cockpit/patrimoine/PatrimoineChart.tsx
git commit -m "feat(patrimoine): restyle chart card (warm emerald)"
```

---

## Task 7: Restyle `TypeBreakdown`

**Files:** Modify `components/cockpit/patrimoine/TypeBreakdown.tsx`

- [ ] **Step 1: Replace `components/cockpit/patrimoine/TypeBreakdown.tsx`**

```tsx
import { eur } from "@/lib/cockpit/format";
import { withShares, typeLabel } from "@/lib/cockpit/patrimoine";
import type { PatrimoineLine } from "@/lib/cockpit/patrimoine";

export function TypeBreakdown({ lines }: { lines: PatrimoineLine[] }) {
  const rows = withShares(lines);
  if (!rows.length) return null;
  return (
    <section className="mb-4">
      <div className="font-display text-[15px] mb-2">Répartition</div>
      {rows.map((r) => {
        const pct = Math.round(r.share * 100);
        return (
          <div key={r.type} className="py-2">
            <div className="flex justify-between items-baseline">
              <span className="text-sm">{typeLabel(r.type)}</span>
              <span className="flex items-baseline gap-2">
                <span className="font-mono-num text-sm">
                  {eur(r.total_value)}
                </span>
                <span className="text-[11px] text-ink-muted">{pct}%</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-rule overflow-hidden mt-1.5">
              <div className="h-full bg-emerald" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </section>
  );
}
```

- [ ] **Step 2: Type-check** — Run `npx tsc --noEmit` → no errors.

- [ ] **Step 3: Commit**

```bash
git add components/cockpit/patrimoine/TypeBreakdown.tsx
git commit -m "feat(patrimoine): Répartition with share bars"
```

---

## Task 8: Restyle `AssetRow` + `AssetList`

**Files:** Modify `components/cockpit/patrimoine/AssetRow.tsx`, `components/cockpit/patrimoine/AssetList.tsx`

**Interfaces:**
- Consumes: `assetIcon` (Task 2).
- Produces: `AssetList({ assets, accounts, loading, error, onSelect, onAdd })` (new `onAdd: () => void`).

- [ ] **Step 1: Replace `components/cockpit/patrimoine/AssetRow.tsx`**

```tsx
import { eur } from "@/lib/cockpit/format";
import { typeLabel } from "@/lib/cockpit/patrimoine";
import { assetIcon } from "@/lib/cockpit/asset-icon";
import type { Asset } from "@/lib/cockpit/patrimoine";

export function AssetRow({
  asset,
  accountName,
  onClick,
}: {
  asset: Asset;
  accountName?: string;
  onClick: () => void;
}) {
  const Icon = assetIcon(asset.type);
  const sub = [typeLabel(asset.type), accountName].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 py-2.5 border-b border-rule text-left"
    >
      <div className="w-9 h-9 rounded-xl bg-tile flex items-center justify-center shrink-0">
        <Icon size={18} className="text-ink2" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{asset.name}</div>
        <div className="text-[11px] text-ink-muted mt-0.5">{sub}</div>
      </div>
      <strong className="font-mono-num text-sm shrink-0">
        {eur(Number(asset.current_value))}
      </strong>
    </button>
  );
}
```

- [ ] **Step 2: Replace `components/cockpit/patrimoine/AssetList.tsx`**

```tsx
import type { Asset } from "@/lib/cockpit/patrimoine";
import type { Account } from "@/lib/cockpit/types";
import { Landmark, Plus } from "lucide-react";
import { AssetRow } from "./AssetRow";

export function AssetList({
  assets,
  accounts,
  loading,
  error,
  onSelect,
  onAdd,
}: {
  assets: Asset[];
  accounts: Account[];
  loading: boolean;
  error: string | null;
  onSelect: (a: Asset) => void;
  onAdd: () => void;
}) {
  const nameOf = (id: string | null) => accounts.find((c) => c.id === id)?.name;
  return (
    <section>
      <div className="font-display text-[15px] mb-2">Mes actifs</div>
      {error && <p className="text-accent text-sm py-4">{error}</p>}
      {loading && !assets.length && (
        <p className="text-ink-muted text-sm py-4">Chargement…</p>
      )}
      {!loading && !error && !assets.length && (
        <div className="text-center py-8 text-ink-muted">
          <Landmark size={30} className="mx-auto mb-2" />
          <div className="text-sm font-semibold text-ink">Aucun actif suivi</div>
          <div className="text-xs mt-0.5">
            Ajoute un compte, un placement ou de l&apos;or.
          </div>
        </div>
      )}
      {assets.map((a) => (
        <AssetRow
          key={a.id}
          asset={a}
          accountName={nameOf(a.account_id)}
          onClick={() => onSelect(a)}
        />
      ))}
      <button
        type="button"
        onClick={onAdd}
        className="w-full mt-3 border-2 border-dashed border-rule rounded-2xl py-3.5 text-sm font-semibold text-ink-muted flex items-center justify-center gap-1.5"
      >
        <Plus size={16} /> Ajouter un actif
      </button>
    </section>
  );
}
```

- [ ] **Step 3: Commit** (tsc gate at Task 9 where the page passes `onAdd`)

```bash
git add components/cockpit/patrimoine/AssetRow.tsx components/cockpit/patrimoine/AssetList.tsx
git commit -m "feat(patrimoine): asset tiles (lucide) + add-asset button"
```

---

## Task 9: Wire the Patrimoine page

**Files:** Modify `app/cockpit/patrimoine/page.tsx`

- [ ] **Step 1: Pass `count` to the hero**

Replace:
```tsx
      <PatrimoineHero total={total} delta={delta} />
```
with:
```tsx
      <PatrimoineHero total={total} delta={delta} count={assets.length} />
```

- [ ] **Step 2: Pass `onAdd` to the asset list**

Replace:
```tsx
      <AssetList
        assets={assets}
        accounts={accounts}
        loading={aLoading}
        error={aError}
        onSelect={setSelected}
      />
```
with:
```tsx
      <AssetList
        assets={assets}
        accounts={accounts}
        loading={aLoading}
        error={aError}
        onSelect={setSelected}
        onAdd={() => setShowCreate(true)}
      />
```

- [ ] **Step 3: Type-check** — Run `npx tsc --noEmit` → no errors.

- [ ] **Step 4: Commit**

```bash
git add app/cockpit/patrimoine/page.tsx
git commit -m "feat(patrimoine): wire hero count + add-asset button"
```

---

## Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite** — Run `npm run test` → PASS (incl. `category-icon`, `asset-icon`, `cockpit-notes`).
- [ ] **Step 2: Type-check** — Run `npx tsc --noEmit` → no errors.
- [ ] **Step 3: Build** — Run `npm run build` → succeeds; `/cockpit` and `/cockpit/patrimoine` present.
- [ ] **Step 4: Manual smoke (`npm run dev`)**:
  1. Cockpit: category rows, "À noter" cards, and the drill header/empty-state now show **lucide line icons** — no emoji anywhere. Tapping Dépenses shows the `Wallet` tile; a category shows its icon; empty search shows the `SearchX` icon.
  2. Patrimoine: green hero (total + delta + "N actifs"), restyled chart card, "Répartition" with bars, "Mes actifs" with lucide tiles + dashed "Ajouter un actif" button (opens the asset modal, same as the Fab).
  3. Add/edit asset and valuations still work; empty state shows the `Landmark` icon.
  4. Legible in light and dark.
- [ ] **Step 5: Final commit (only if tweaks needed)**

```bash
git add -A
git commit -m "chore(redesign): Patrimoine + icons verification fixes"
```

---

## Self-review notes

- **Spec coverage:** category-icon→lucide (Task 1) ; asset-icon (Task 2) ; notes kind (Task 3) ; consumers render lucide incl. page Wallet + OpsDrill SearchX (Task 4) ; Patrimoine hero/chart/breakdown/asset-list + page wiring (Tasks 5–9) ; verification incl. "no emoji" + light/dark (Task 10). All covered.
- **Placeholder scan:** none; full code in every step.
- **Type consistency:** `LucideIcon` from `category-icon`/`asset-icon` consumed by `CategoryRow`(`Icon`), `CategoryBreakdown`, `AssetRow`, `OpsDrill`(`Icon`), page (`Wallet`) ; `Note.kind` (Task 3) consumed by `InsightsRow` (Task 4) ; `AssetList.onAdd` (Task 8) supplied by page (Task 9) ; `PatrimoineHero.count` (Task 5) supplied by page (Task 9).
- **Vitest + lucide:** tests import lucide components and compare references (`toBe`) — no rendering; lucide-react resolves under the existing vitest setup.
- **Opacity caveat:** `bg-accent/70`, `bg-white/[0.16]` use hex/white (valid); var tokens stay solid.
- **Branch note:** continues `boussole-redesign`; docs committed on the branch.
