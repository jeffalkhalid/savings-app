# Cockpit — Import relevé BNP (.xls) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importer un export `.xls` BNP en transactions cockpit — parsing (SheetJS), catégorisation par mapping statique, dédoublonnage `(date, montant)`, écran de revue éditable, insert en masse — entièrement côté client.

**Architecture:** Module pur testé `lib/cockpit/bnp-import.ts` (parse/map/dedupe), un `createTransactionsBulk` dans `transactions-api.ts` (préserve le montant signé), des composants sous `components/cockpit/import/`, la page `/cockpit/import`, et un bouton d'entrée au Dashboard. Aucune IA, aucun serveur.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3, Supabase JS, SheetJS (`xlsx`), Vitest.

---

## File structure

```
lib/cockpit/
  bnp-import.ts        # PUR + testé : parseBnpSheet, mapBnpCategory, rowKey, markDuplicates ; types ParsedRow, ReviewRow
  bnp-import.test.ts   # Vitest
  transactions-api.ts  # MODIF : + ImportRow, createTransactionsBulk

components/cockpit/import/
  ImportDropzone.tsx   # input file .xls
  ReviewRow.tsx        # 1 ligne éditable
  ReviewTable.tsx      # compteurs + compte cible + lignes + bouton importer

app/cockpit/import/page.tsx   # orchestration (parse -> dedupe -> review -> insert)
app/cockpit/page.tsx          # MODIF : lien « Import » dans l'en-tête
package.json                  # MODIF : + xlsx
```

Reuse: `@/lib/cockpit/format` (`eur`), `@/lib/cockpit/types` (`Category`, `Account`), `@/lib/cockpit/hooks` (`useAuth`, `useCategories`, `useAccounts`), `@/lib/cockpit/supabase` (`supabase`).

---

## Task 1: Install SheetJS

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install xlsx**

Run: `npm install xlsx`
Expected: `xlsx` added to dependencies.

- [ ] **Step 2: Verify it imports**

Run: `node -e "const x=require('xlsx'); console.log(typeof x.read)"`
Expected: prints `function`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(import): add xlsx (SheetJS) for BNP .xls parsing"
```

---

## Task 2: bnp-import pure module (TDD)

**Files:**
- Create: `lib/cockpit/bnp-import.ts`
- Test: `lib/cockpit/bnp-import.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/cockpit/bnp-import.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  parseBnpSheet,
  mapBnpCategory,
  rowKey,
  markDuplicates,
} from "./bnp-import";

const sheet: string[][] = [
  ["Compte de chèques ****8172", "Solde au 15/06/2026", "3614.49", "EUR", "", "", ""],
  [],
  [
    "Date operation",
    "Categorie operation",
    "Sous Categorie operation",
    "Libelle operation",
    "Montant operation",
    "Pointage operation",
    "Commentaire operation",
  ],
  ["12-06-2026", "À catégoriser", "Virement émis", "VIREMENT EMIS", "-300", "", ""],
  ["12-06-2026", "Loisirs et Sorties", "Sport", "CB INTERSPORT", "-149,99", "", ""],
  ["bad-row"],
];

describe("parseBnpSheet", () => {
  it("skips the account header and parses data rows", () => {
    const rows = parseBnpSheet(sheet);
    expect(rows).toHaveLength(2);
  });
  it("converts date to ISO and amount to a signed number", () => {
    const [first, second] = parseBnpSheet(sheet);
    expect(first).toEqual({
      date: "2026-06-12",
      label: "VIREMENT EMIS",
      amount: -300,
      bnpCategory: "À catégoriser",
      bnpSubCategory: "Virement émis",
    });
    expect(second.amount).toBeCloseTo(-149.99);
  });
  it("returns [] when no header row is present", () => {
    expect(parseBnpSheet([["x", "y"]])).toEqual([]);
  });
});

describe("mapBnpCategory", () => {
  it("maps by sub-category first", () => {
    expect(mapBnpCategory("À catégoriser", "Virement émis")).toBe("Virements");
    expect(mapBnpCategory("Loisirs et Sorties", "Sport")).toBe("Sport & Bien-être");
  });
  it("falls back to the category", () => {
    expect(mapBnpCategory("Revenus", "Inconnu")).toBe("Salaire");
  });
  it("defaults to Imprévus & Santé when nothing matches", () => {
    expect(mapBnpCategory("Zzz", "Yyy")).toBe("Imprévus & Santé");
  });
});

describe("rowKey / markDuplicates", () => {
  it("builds a date|amount key", () => {
    expect(rowKey("2026-06-12", -300)).toBe("2026-06-12|-300");
  });
  it("flags rows already present and applies the mapping", () => {
    const parsed = parseBnpSheet(sheet);
    const existing = new Set(["2026-06-12|-300"]);
    const reviewed = markDuplicates(parsed, existing);
    expect(reviewed[0].duplicate).toBe(true);
    expect(reviewed[0].categoryName).toBe("Virements");
    expect(reviewed[1].duplicate).toBe(false);
    expect(reviewed[1].categoryName).toBe("Sport & Bien-être");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- bnp-import`
Expected: FAIL — `Cannot find module './bnp-import'`.

- [ ] **Step 3: Implement bnp-import.ts**

Create `lib/cockpit/bnp-import.ts`:

```ts
export type ParsedRow = {
  date: string; // ISO YYYY-MM-DD
  label: string;
  amount: number; // signé
  bnpCategory: string;
  bnpSubCategory: string;
};

export type ReviewRow = ParsedRow & {
  categoryName: string;
  duplicate: boolean;
};

const norm = (s: string): string => (s ?? "").trim().toLowerCase();

// Mapping prioritaire par sous-catégorie BNP -> nom de catégorie cockpit.
const BY_SUBCATEGORY: Record<string, string> = {
  "virement émis": "Virements",
  "virement reçu": "Virements",
  "téléphone": "Téléphonie",
  "électricité, gaz": "Énergie",
  "assurances": "Assurance",
  "sport": "Sport & Bien-être",
  "habillement": "Vêtements & Hygiène",
  "coiffeur, cosmétique, soins": "Vêtements & Hygiène",
  "achats, shopping": "Courses alimentaires",
  "salaire": "Salaire",
  "loisirs et sorties - autres": "Loisirs & Streaming",
};

// Repli par catégorie BNP de premier niveau.
const BY_CATEGORY: Record<string, string> = {
  revenus: "Salaire",
  logement: "Logement",
  "abonnements et telephonie": "Téléphonie",
  "loisirs et sorties": "Loisirs & Streaming",
  "vie quotidienne": "Courses alimentaires",
  "autres dépenses": "Imprévus & Santé",
  "à catégoriser": "Virements",
  transport: "Transport",
};

const DEFAULT_CATEGORY = "Imprévus & Santé";

export function mapBnpCategory(category: string, subCategory: string): string {
  return (
    BY_SUBCATEGORY[norm(subCategory)] ??
    BY_CATEGORY[norm(category)] ??
    DEFAULT_CATEGORY
  );
}

function toISODate(s: string): string {
  const m = String(s).trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

function toAmount(s: string): number {
  return parseFloat(String(s).replace(/\s/g, "").replace(",", "."));
}

// Trouve la ligne d'en-tête ("Date operation"), parse les lignes suivantes valides.
export function parseBnpSheet(rows: string[][]): ParsedRow[] {
  const headerIdx = rows.findIndex((r) =>
    Array.isArray(r) && r.some((c) => norm(c) === "date operation")
  );
  if (headerIdx === -1) return [];

  const out: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r) || r.length < 5) continue;
    const date = toISODate(String(r[0] ?? ""));
    const amount = toAmount(String(r[4] ?? ""));
    if (!date || !isFinite(amount)) continue;
    out.push({
      date,
      label: String(r[3] ?? "").trim(),
      amount,
      bnpCategory: String(r[1] ?? "").trim(),
      bnpSubCategory: String(r[2] ?? "").trim(),
    });
  }
  return out;
}

export function rowKey(dateISO: string, amount: number): string {
  return `${dateISO}|${amount}`;
}

export function markDuplicates(
  rows: ParsedRow[],
  existingKeys: Set<string>
): ReviewRow[] {
  return rows.map((r) => ({
    ...r,
    categoryName: mapBnpCategory(r.bnpCategory, r.bnpSubCategory),
    duplicate: existingKeys.has(rowKey(r.date, r.amount)),
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- bnp-import`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/bnp-import.ts lib/cockpit/bnp-import.test.ts
git commit -m "feat(import): add pure BNP parse/map/dedupe module with tests"
```

---

## Task 3: createTransactionsBulk

**Files:**
- Modify: `lib/cockpit/transactions-api.ts` (append)

- [ ] **Step 1: Append the bulk insert**

Append to `lib/cockpit/transactions-api.ts` (it already imports `supabase` from `./supabase`):

```ts
export type ImportRow = {
  date: string; // ISO
  amount: number; // signé brut (préservé tel quel)
  description: string;
  categoryId: string;
  type: string;
  accountId: string;
};

// Insert en masse. Préserve le montant signé (ne repasse PAS par signedAmount).
export async function createTransactionsBulk(
  userId: string,
  rows: ImportRow[]
): Promise<void> {
  if (!rows.length) return;
  const { error } = await supabase.from("transactions").insert(
    rows.map((r) => ({
      user_id: userId,
      date: r.date,
      amount: r.amount,
      description: r.description,
      merchant: r.description || null,
      category_id: r.categoryId,
      account_id: r.accountId,
      type: r.type,
      source: "import",
    }))
  );
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add lib/cockpit/transactions-api.ts
git commit -m "feat(import): add createTransactionsBulk preserving signed amounts"
```

---

## Task 4: Import components

**Files:**
- Create: `components/cockpit/import/ImportDropzone.tsx`
- Create: `components/cockpit/import/ReviewRow.tsx`
- Create: `components/cockpit/import/ReviewTable.tsx`

- [ ] **Step 1: ImportDropzone.tsx**

```tsx
"use client";

export function ImportDropzone({ onFile }: { onFile: (file: File) => void }) {
  return (
    <label className="block border-2 border-dashed border-rule rounded-xl p-8 text-center cursor-pointer">
      <input
        type="file"
        accept=".xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      <div className="font-display text-lg mb-1">Importer un relevé BNP</div>
      <div className="text-ink-muted text-sm">Sélectionne ton export .xls</div>
    </label>
  );
}
```

- [ ] **Step 2: ReviewRow.tsx**

```tsx
import { eur } from "@/lib/cockpit/format";
import type { Category } from "@/lib/cockpit/types";
import type { ReviewRow as ReviewRowData } from "@/lib/cockpit/bnp-import";

export function ReviewRow({
  row,
  categories,
  onCategory,
  onToggleInclude,
}: {
  row: ReviewRowData & { include: boolean };
  categories: Category[];
  onCategory: (name: string) => void;
  onToggleInclude: (v: boolean) => void;
}) {
  const neg = row.amount < 0;
  const resolved = categories.some((c) => c.name === row.categoryName);
  return (
    <div
      className={`py-2 border-b border-rule ${
        row.duplicate && !row.include ? "opacity-50" : ""
      }`}
    >
      <div className="flex justify-between items-center gap-2">
        <div className="min-w-0">
          <div className="text-sm truncate">{row.label}</div>
          <div className="text-[11px] text-ink-muted">
            {row.date}
            {row.duplicate ? " · doublon" : ""}
          </div>
        </div>
        <strong
          className={`font-mono-num text-sm shrink-0 ${
            neg ? "text-strat-a" : "text-emerald"
          }`}
        >
          {eur(row.amount)}
        </strong>
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <select
          className={`border rounded-lg px-2 py-1.5 text-[13px] bg-white flex-1 ${
            resolved ? "border-rule" : "border-strat-a"
          }`}
          value={row.categoryName}
          onChange={(e) => onCategory(e.target.value)}
        >
          {!resolved && (
            <option value={row.categoryName}>{row.categoryName} (?)</option>
          )}
          {categories.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        {row.duplicate && (
          <label className="text-[11px] text-ink-muted flex items-center gap-1 shrink-0">
            <input
              type="checkbox"
              checked={row.include}
              onChange={(e) => onToggleInclude(e.target.checked)}
            />
            inclure
          </label>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: ReviewTable.tsx**

```tsx
import type { Category, Account } from "@/lib/cockpit/types";
import type { ReviewRow as ReviewRowData } from "@/lib/cockpit/bnp-import";
import { ReviewRow } from "./ReviewRow";

type Row = ReviewRowData & { include: boolean };

export function ReviewTable({
  rows,
  categories,
  accounts,
  accountId,
  onAccount,
  onCategory,
  onToggleInclude,
  onImport,
  importing,
}: {
  rows: Row[];
  categories: Category[];
  accounts: Account[];
  accountId: string;
  onAccount: (id: string) => void;
  onCategory: (index: number, name: string) => void;
  onToggleInclude: (index: number, v: boolean) => void;
  onImport: () => void;
  importing: boolean;
}) {
  const toImport = rows.filter((r) => r.include).length;
  const dupes = rows.filter((r) => r.duplicate).length;
  return (
    <section>
      <div className="text-xs uppercase tracking-[0.1em] text-ink-muted mb-2">
        {toImport} à importer · {dupes} doublon{dupes > 1 ? "s" : ""}
      </div>
      <label className="grid gap-1.5 text-[13px] text-ink-muted mb-4">
        Compte cible
        <select
          className="border border-rule rounded-lg px-3 py-3 bg-white text-base w-full"
          value={accountId}
          onChange={(e) => onAccount(e.target.value)}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <div className="mb-5">
        {rows.map((r, i) => (
          <ReviewRow
            key={`${r.date}-${i}`}
            row={r}
            categories={categories}
            onCategory={(name) => onCategory(i, name)}
            onToggleInclude={(v) => onToggleInclude(i, v)}
          />
        ))}
      </div>
      <button
        className="bg-emerald text-paper rounded-lg py-3.5 font-semibold w-full disabled:opacity-60"
        onClick={onImport}
        disabled={importing || toImport === 0}
      >
        {importing ? "Import…" : `Importer ${toImport} ligne${toImport > 1 ? "s" : ""}`}
      </button>
    </section>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add components/cockpit/import/ImportDropzone.tsx components/cockpit/import/ReviewRow.tsx components/cockpit/import/ReviewTable.tsx
git commit -m "feat(import): add dropzone and review table components"
```

---

## Task 5: Import page + Dashboard entry

**Files:**
- Create: `app/cockpit/import/page.tsx`
- Modify: `app/cockpit/page.tsx` (add an "Import" link in the header)

- [ ] **Step 1: Create the import page**

Create `app/cockpit/import/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { useAuth, useCategories, useAccounts } from "@/lib/cockpit/hooks";
import { supabase } from "@/lib/cockpit/supabase";
import {
  parseBnpSheet,
  markDuplicates,
  rowKey,
} from "@/lib/cockpit/bnp-import";
import type { ReviewRow as ReviewRowData } from "@/lib/cockpit/bnp-import";
import {
  createTransactionsBulk,
  type ImportRow,
} from "@/lib/cockpit/transactions-api";
import { ImportDropzone } from "@/components/cockpit/import/ImportDropzone";
import { ReviewTable } from "@/components/cockpit/import/ReviewTable";

type Row = ReviewRowData & { include: boolean };

export default function ImportPage() {
  const user = useAuth();
  const router = useRouter();
  const { categories } = useCategories();
  const { accounts } = useAccounts();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [accountId, setAccountId] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);

  const handleFile = async (file: File) => {
    setError("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const grid = XLSX.utils.sheet_to_json<string[]>(sheet, {
        header: 1,
        raw: false,
        defval: "",
      }) as string[][];
      const parsed = parseBnpSheet(grid);
      if (!parsed.length) {
        setError("Format BNP non reconnu ou aucune transaction.");
        return;
      }
      const dates = parsed.map((p) => p.date).sort();
      const { data } = await supabase
        .from("transactions")
        .select("date,amount")
        .gte("date", dates[0])
        .lte("date", dates[dates.length - 1]);
      const existing = new Set(
        (data ?? []).map((d) =>
          rowKey(String((d as { date: string }).date), Number((d as { amount: number }).amount))
        )
      );
      const reviewed = markDuplicates(parsed, existing);
      setRows(reviewed.map((r) => ({ ...r, include: !r.duplicate })));
      setAccountId(
        accounts.find((a) => a.name.includes("BNP"))?.id ?? accounts[0]?.id ?? ""
      );
    } catch {
      setError("Lecture du fichier impossible.");
    }
  };

  const setCategory = (i: number, name: string) =>
    setRows((rs) =>
      rs ? rs.map((r, idx) => (idx === i ? { ...r, categoryName: name } : r)) : rs
    );
  const setInclude = (i: number, v: boolean) =>
    setRows((rs) =>
      rs ? rs.map((r, idx) => (idx === i ? { ...r, include: v } : r)) : rs
    );

  const doImport = async () => {
    if (!rows) return;
    setError("");
    const importRows: ImportRow[] = [];
    for (const r of rows.filter((x) => x.include)) {
      const cat = categories.find((c) => c.name === r.categoryName);
      if (!cat) {
        setError(`Catégorie non résolue : ${r.categoryName}`);
        return;
      }
      importRows.push({
        date: r.date,
        amount: r.amount,
        description: r.label,
        categoryId: cat.id,
        type: cat.type,
        accountId,
      });
    }
    setImporting(true);
    try {
      await createTransactionsBulk(user.id, importRows);
      router.push("/cockpit");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setImporting(false);
    }
  };

  return (
    <main className="max-w-[600px] mx-auto px-5 pt-8">
      <header className="flex justify-between items-center mb-6">
        <h1 className="font-display text-2xl">Importer</h1>
        <button
          onClick={() => router.push("/cockpit")}
          className="text-ink-muted text-sm"
        >
          Retour
        </button>
      </header>

      {!rows && <ImportDropzone onFile={handleFile} />}
      {error && <p className="text-strat-a text-sm mt-4">{error}</p>}

      {rows && (
        <ReviewTable
          rows={rows}
          categories={categories}
          accounts={accounts}
          accountId={accountId}
          onAccount={setAccountId}
          onCategory={setCategory}
          onToggleInclude={setInclude}
          onImport={doImport}
          importing={importing}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 2: Add the Import link to the Dashboard header**

In `app/cockpit/page.tsx`, add this import near the other imports:

```tsx
import Link from "next/link";
```

Then, in the header's right-hand `<div className="flex items-center gap-2">`, add a link before the "Déco" button so it reads:

```tsx
        <div className="flex items-center gap-2">
          <MonthSwitcher month={month} onChange={setMonth} />
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
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add app/cockpit/import/page.tsx app/cockpit/page.tsx
git commit -m "feat(import): add import page and dashboard entry link"
```

---

## Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm run test`
Expected: PASS — all suites incl. `bnp-import` green.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: Build succeeds; `/cockpit/import` present in the route output.

- [ ] **Step 4: Manual smoke (dev server)**

Run: `npm run dev`, log in, open `/cockpit`. Verify:
1. Header shows an "Import" link → opens `/cockpit/import` with the dropzone.
2. Selecting the real BNP `.xls` (`C:\Users\jeffa\Bureau\3ers\export_16_06_2026_10_31_36.xls`) shows the review table: rows with date, label, signed amount, a pre-mapped category dropdown, and the new/duplicate counts.
3. Rows whose mapped category isn't a real cockpit category show a red-bordered "(?)" select; picking a real one clears it.
4. Duplicates are excluded by default; ticking "inclure" adds them to the count.
5. "Importer N lignes" inserts and returns to `/cockpit`; the imported rows appear (correct signs) and the month stats reflect them.
6. Re-importing the same file marks every row as a duplicate (0 to import by default).

- [ ] **Step 5: Final commit (if any tweaks were needed)**

```bash
git add -A
git commit -m "chore(import): verification pass fixes"
```

---

## Self-review notes

- **Spec coverage:** xlsx dep (Task 1); parseBnpSheet/mapBnpCategory/rowKey/markDuplicates pure + tested (Task 2); createTransactionsBulk preserving signed amount (Task 3); dropzone + review table with editable category + dup checkbox + target account (Task 4); page orchestration (parse→dedup via existing-range fetch→review→bulk insert) + dashboard entry (Task 5); states (format non reconnu, 0 ligne, insert error, unresolved category blocks via the find→error) (Task 5); verification incl. route + re-import dedup (Task 6). All covered.
- **Placeholder scan:** none; full code in every step.
- **Type consistency:** `ParsedRow`/`ReviewRow` (Task 2) imported by components (Task 4) and page (Task 5); `Row = ReviewRow & { include }` defined identically in ReviewTable (Task 4) and page (Task 5); `ImportRow`/`createTransactionsBulk` (Task 3) used by the page (Task 5); `mapBnpCategory` returns names matched against `categories` (resolved to `category_id`+`type` at insert). Category `type` is `string` (matches `Category.type`).
- **Note:** `type` is taken from the resolved cockpit category, and the BNP signed amount is inserted as-is (bulk path bypasses `signedAmount`), so refunds/credits keep their real sign.
- **Branch note:** `csv-import` from updated `main` (has `transactions-api`). xlsx adds client bundle weight — acceptable for a personal app.
