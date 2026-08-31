# Import BNP : parseur multi-format + classification automatique — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un export BNP de n'importe quel format s'importe sans erreur et chaque ligne arrive déjà catégorisée, avec la trace de la façon dont elle l'a été ; corriger une ligne — ou une sélection — enseigne la règle à l'app pour tous les imports suivants.

**Architecture :** un extracteur de commerçant pur (`merchantKey`) devient la clé unique de l'app, partagée par les règles de catégorie et la détection d'engagements ; une cascade de classification déterministe à cinq niveaux attribue une catégorie et une provenance à chaque ligne ; les décisions de l'utilisateur sont persistées dans une table `category_rules`.

**Tech Stack :** Next.js 15 (App Router), React 19, TypeScript, Tailwind 3, Supabase (Postgres + RLS), Vitest 4, lucide-react, xlsx.

**Spec :** `docs/superpowers/specs/2026-08-31-import-classification-auto-design.md`

## Global Constraints

- Le français est la langue de toute l'UI et des messages d'erreur affichés.
- Icônes : **lucide-react** uniquement, jamais d'emoji.
- Montants affichés en `.font-mono-num` ; tokens Boussole (`text-ink`, `text-ink-muted`, `bg-card`, `bg-paper`, `border-rule`, `text-accent`, `bg-seg`, `bg-emerald`, `text-strat-a`).
- Les modules `lib/` restent purs (aucun import React, aucun accès réseau) sauf les fichiers `*-api.ts` et `hooks.ts`.
- Aucune migration n'est appliquée par l'agent : les fichiers `supabase/*.sql` sont exécutés à la main par l'utilisateur dans le SQL editor.
- Les modales suivent le patron existant (`ReglagesModal.tsx`, `BudgetsModal.tsx`) — il n'y a pas de primitive `Sheet` partagée dans ce repo.
- Commits en anglais, format `type(scope): message`, avec la ligne `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Tests : `npm run test` (Vitest 4). Vérification finale : `npx tsc --noEmit` puis `npm run build`.
- **Ne jamais lancer vitest avec `--update` ou `-u`** : `lib/simulator.test.ts` contient des snapshots de caractérisation qui doivent rester intacts.

---

### Task 1: Extracteur de commerçant `merchantKey`

C'est le cœur technique du chantier. Sans lui, une règle mémorisée ne se rappliquerait jamais : le loyer Foncia produit 9 clés différentes avec `normalizePayee`, l'abonnement Wellness Training 14.

**Attention au cycle d'imports.** `recurring-detect.ts` exporte aujourd'hui `normalizePayee`, et quatre fichiers l'importent de là. En Task 8, `recurring-detect.ts` devra importer `merchantKey`. Pour éviter un cycle, cette tâche **déplace** `normalizePayee` dans le nouveau module et le **ré-exporte** depuis `recurring-detect.ts`, ce qui laisse tous les sites d'import existants intacts.

**Files:**
- Create: `lib/cockpit/payee-key.ts`
- Modify: `lib/cockpit/recurring-detect.ts` (retirer la définition de `normalizePayee`, la ré-exporter)
- Test: `lib/cockpit/payee-key.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `function normalizePayee(s: string): string` — déplacée telle quelle depuis `recurring-detect.ts`, comportement inchangé.
  - `function merchantKey(description: string): string`

- [ ] **Step 1: Écrire les tests qui échouent**

Les libellés ci-dessous sont les **vrais libellés** de l'export de l'utilisateur, copiés à l'identique.

Créer `lib/cockpit/payee-key.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { merchantKey, normalizePayee } from "./payee-key";

describe("normalizePayee (comportement historique préservé)", () => {
  it("minuscule, retire accents, chiffres et ponctuation", () => {
    expect(normalizePayee("CARREFOUR Banque 123-456")).toBe("carrefour banque");
    expect(normalizePayee("Éléctricité")).toBe("electricite");
  });
  it("tolère null et vide", () => {
    expect(normalizePayee("")).toBe("");
    expect(normalizePayee(undefined as unknown as string)).toBe("");
  });
});

describe("merchantKey — prélèvements SEPA", () => {
  it("extrait le créancier avant ECH/", () => {
    expect(
      merchantKey(
        "PRLV SEPA CARREFOUR BANQUE ECH/080825 ID EMETTEUR/FR83ZZZ135674 MDT/CS00-51272097231100 REF/CBSDD20250806000000000000272063PS2P LIB/51272097231100PRLV COMPTANT IMMEDIAT"
      )
    ).toBe("carrefour banque");
  });

  it("donne UNE seule clé aux variantes Foncia (9 clés auparavant)", () => {
    const a =
      "PRLV SEPA FONCIA VAL DE MARNE GERANCE ECH/211025 ID EMETTEUR/FR62ZZZ431223 MDT/W0202008046914587987906 REF/E2E-68F235C5CC8CB6B85DA36626 LIB/PRELEVEMENT LOYER FONCIA";
    const b =
      "PRLV SEPA FONCIA VAL DE MARNE GERANCE ECH/211125 ID EMETTEUR/FR62ZZZ431223 MDT/W0202008046914587987906 REF/E2E-99A111B2CC3DD4E55FA66777 LIB/PRELEVEMENT LOYER FONCIA";
    expect(merchantKey(a)).toBe("foncia val de marne gerance");
    expect(merchantKey(a)).toBe(merchantKey(b));
  });

  it("donne UNE seule clé aux variantes Wellness Training (14 clés auparavant)", () => {
    const a =
      "PRLV SEPA WELLNESS TRAINING ECH/020925 ID EMETTEUR/FR80ZZZ509663 MDT/RUMWE543014101 REF/WEL-09-4224131-GMQBJB3G LIB/WELLNESS TRAINING CARREFOUR MASSY - WEL-09-4224131-GMQBJB3G";
    const b =
      "PRLV SEPA WELLNESS TRAINING ECH/021025 ID EMETTEUR/FR80ZZZ509663 MDT/RUMWE543014101 REF/WEL-10-4224131-VPAXL7WK LIB/WELLNESS TRAINING CARREFOUR MASSY - WEL-10-4224131-VPAXL7WK";
    expect(merchantKey(a)).toBe("wellness training");
    expect(merchantKey(a)).toBe(merchantKey(b));
  });
});

describe("merchantKey — paiements carte", () => {
  it("extrait le commerçant entre la date et CARTE", () => {
    expect(
      merchantKey(
        "FACTURE CARTE DU 050825 ELIOR ENTRETRIS CARTE   4974XXXXXXXX4402                FRA    20,00EUR"
      )
    ).toBe("elior entretris");
  });

  it("ignore la date et le montant, qui varient", () => {
    const a =
      "FACTURE CARTE DU 131025 CAMPUS CARREFOU CARTE   4974XXXXXXXX4402                FRA    80,00EUR";
    const b =
      "FACTURE CARTE DU 021125 CAMPUS CARREFOU CARTE   4974XXXXXXXX4402                FRA    12,50EUR";
    expect(merchantKey(a)).toBe("campus carrefou");
    expect(merchantKey(a)).toBe(merchantKey(b));
  });
});

describe("merchantKey — virements", () => {
  it("extrait l'émetteur d'un virement reçu", () => {
    expect(
      merchantKey(
        "VIR SEPA RECU /DE CARREFOUR FRANCE /MOTIF  /REF CARREFOUR 1961870275237171845034602"
      )
    ).toBe("carrefour france");
  });

  it("extrait l'émetteur d'un virement instantané reçu", () => {
    expect(
      merchantKey(
        "VIR SEPA INST RECU /DE MLLE YASMINE JEFFAL /REF 032025273685917520000001 /MOTIF REMBOURSEMENT"
      )
    ).toBe("mlle yasmine jeffal");
  });

  it("extrait le bénéficiaire d'un virement émis", () => {
    expect(
      merchantKey(
        "VIR SEPA INST EMIS /MOTIF MONTENEGRO /BEN KHALID REVOLUT /REFDO 2EF3099DF17C4DBD8A0B29B1786A412B /REFBEN NOTPROVIDED"
      )
    ).toBe("khalid revolut");
  });

  it("extrait le libellé d'un virement permanent", () => {
    expect(
      merchantKey("VIREMENT FAVEUR TIERS VR.PERMANENT LOYER 31 RUE CAMILLE DESMOULIN")
    ).toBe("vr permanent loyer rue camille desmoulin");
  });
});

describe("merchantKey — autres opérations", () => {
  it("regroupe tous les retraits DAB", () => {
    const a =
      "RETRAIT DAB 23/08/25 09H26 17877A00 2SF SOCIETE DES SERV      CACHAN           0004974XXXXXXXX4402";
    const b =
      "RETRAIT DAB 02/09/25 18H03 44120B01 AUTRE BANQUE             PARIS            0004974XXXXXXXX4402";
    expect(merchantKey(a)).toBe("retrait dab");
    expect(merchantKey(a)).toBe(merchantKey(b));
  });

  it("retombe sur normalizePayee quand aucun motif ne matche", () => {
    expect(
      merchantKey("COMMISSIONS COTISATION A UNE OFFRE GROUPEE DE SERVICES ESPRIT LIBRE")
    ).toBe("commissions cotisation a une offre groupee de services esprit libre");
  });

  it("tolère vide et null", () => {
    expect(merchantKey("")).toBe("");
    expect(merchantKey(null as unknown as string)).toBe("");
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/cockpit/payee-key.test.ts`
Expected: FAIL — « Failed to resolve import "./payee-key" ».

- [ ] **Step 3: Écrire le module**

Créer `lib/cockpit/payee-key.ts` :

```ts
/**
 * Clé de commerçant : identifie un commerçant à travers des libellés bancaires
 * dont une partie change à chaque opération (date, référence SEPA, montant).
 *
 * `normalizePayee` seul ne suffit pas : il ne retire que les chiffres, donc les
 * références alphanumériques survivent et éclatent un même commerçant en autant
 * de clés (Foncia : 9 clés, Wellness Training : 14).
 */
export function normalizePayee(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Motifs essayés dans l'ordre ; le premier qui matche gagne. */
const PATTERNS: RegExp[] = [
  // PRLV SEPA <créancier> ECH/… | ID EMETTEUR…
  /^PRLV\s+SEPA\s+(.+?)\s+(?:ECH\/|ID\s+EMETTEUR)/i,
  // FACTURE CARTE DU <6 chiffres> <commerçant> CARTE …
  /^FACTURE\s+CARTE\s+DU\s+\d{6}\s+(.+?)\s+CARTE\b/i,
  // VIR SEPA [INST] RECU /DE <émetteur> /REF… | /MOTIF…
  /^VIR\s+SEPA\s+(?:INST\s+)?RECU\s*\/?\s*DE\s+(.+?)(?:\s*\/(?:MOTIF|REF)|$)/i,
  // VIR SEPA [INST] EMIS … /BEN <bénéficiaire> /…
  /^VIR\s+SEPA\s+(?:INST\s+)?EMIS\b.*?\/BEN\s+(.+?)(?:\s*\/|$)/i,
  // VIREMENT FAVEUR TIERS <libellé>
  /^VIREMENT\s+FAVEUR\s+TIERS\s+(.+?)(?:\s*\/|$)/i,
];

export function merchantKey(description: string): string {
  const s = String(description ?? "").trim();
  if (!s) return "";
  if (/^RETRAIT\s+DAB\b/i.test(s)) return "retrait dab";
  for (const re of PATTERNS) {
    const m = s.match(re);
    if (m && m[1]) {
      const key = normalizePayee(m[1]);
      if (key) return key;
    }
  }
  return normalizePayee(s);
}
```

- [ ] **Step 4: Ré-exporter `normalizePayee` depuis `recurring-detect.ts`**

Dans `lib/cockpit/recurring-detect.ts`, **supprimer** la définition de `normalizePayee` (lignes 3 à 11) et la remplacer, juste sous l'import existant de `Txn`, par :

```ts
import { normalizePayee } from "./payee-key";

export { normalizePayee };
```

Le reste du fichier est inchangé pour l'instant : `detectRecurring` et `isEngagement` continuent d'utiliser `normalizePayee`. La bascule vers `merchantKey` est la Task 8.

- [ ] **Step 5: Lancer les tests et les types**

Run: `npx vitest run lib/cockpit/payee-key.test.ts`
Expected: PASS (14 tests).

Run: `npm run test`
Expected: PASS — en particulier `recurring-detect.test.ts` et `recurring-match.test.ts`, inchangés, prouvent que le déplacement de `normalizePayee` n'a rien cassé.

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add lib/cockpit/payee-key.ts lib/cockpit/payee-key.test.ts lib/cockpit/recurring-detect.ts
git commit -m "feat(import): merchantKey extractor collapsing SEPA reference noise

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Parseur multi-format

**Files:**
- Modify: `lib/cockpit/bnp-import.ts`
- Test: `lib/cockpit/bnp-import.test.ts`

**Interfaces:**
- Consumes: rien des tâches précédentes.
- Produces:
  - `ParsedRow` gagne `shortLabel: string` et `operationType: string`.
  - `parseBnpSheet(rows: string[][]): ParsedRow[]` — signature inchangée, tolère les deux formats.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter dans `lib/cockpit/bnp-import.test.ts`, après le `describe("parseBnpSheet", …)` existant :

```ts
const sheet13Mois: string[][] = [
  ["Compte de ch&egrave;ques", "Compte de ch&amp;egrave;ques", "****8172", "28/08/2026", "", "3546.30"],
  ["", "", "", "", "", ""],
  [
    "Date operation",
    "Libelle court",
    "Type operation",
    "Libelle operation",
    "Montant operation en euro",
    "",
  ],
  [
    "07/08/2025",
    "PAIEMENT CB",
    "FACTURE CARTE",
    "FACTURE CARTE DU 050825 ELIOR ENTRETRIS CARTE   4974XXXXXXXX4402                FRA    20,00EUR",
    "-20.00",
    "",
  ],
  [
    "08/08/2025",
    "PRELEVEMENT",
    "PRLV SEPA",
    "PRLV SEPA CARREFOUR BANQUE ECH/080825 ID EMETTEUR/FR83ZZZ135674 MDT/CS00-51272097231100 REF/X LIB/Y",
    "-22.41",
    "",
  ],
];

describe("parseBnpSheet — export 13 mois", () => {
  it("parse les dates à slashes", () => {
    const rows = parseBnpSheet(sheet13Mois);
    expect(rows).toHaveLength(2);
    expect(rows[0].date).toBe("2025-08-07");
  });

  it("lit le libellé et le montant par nom de colonne", () => {
    const [first] = parseBnpSheet(sheet13Mois);
    expect(first.label).toContain("ELIOR ENTRETRIS");
    expect(first.amount).toBeCloseTo(-20);
  });

  it("remplit shortLabel et operationType", () => {
    const [first] = parseBnpSheet(sheet13Mois);
    expect(first.shortLabel).toBe("PAIEMENT CB");
    expect(first.operationType).toBe("FACTURE CARTE");
  });

  it("laisse les catégories BNP vides quand l'export ne les fournit pas", () => {
    const [first] = parseBnpSheet(sheet13Mois);
    expect(first.bnpCategory).toBe("");
    expect(first.bnpSubCategory).toBe("");
  });

  it("renvoie [] si une colonne obligatoire manque", () => {
    const sansMontant = [
      ["Date operation", "Libelle operation"],
      ["07/08/2025", "X"],
    ];
    expect(parseBnpSheet(sansMontant)).toEqual([]);
  });

  it("ne dépend pas de l'ordre des colonnes", () => {
    const inverse: string[][] = [
      ["Montant operation en euro", "Libelle operation", "Date operation"],
      ["-20.00", "FACTURE CARTE DU 050825 ELIOR ENTRETRIS CARTE 4974", "07/08/2025"],
    ];
    const rows = parseBnpSheet(inverse);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBeCloseTo(-20);
    expect(rows[0].date).toBe("2025-08-07");
  });
});

describe("parseBnpSheet — l'ancien format reste supporté", () => {
  it("remplit shortLabel et operationType avec des chaînes vides", () => {
    const [first] = parseBnpSheet(sheet);
    expect(first.shortLabel).toBe("");
    expect(first.operationType).toBe("");
    expect(first.bnpCategory).toBe("À catégoriser");
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/cockpit/bnp-import.test.ts`
Expected: FAIL — le premier test échoue sur `expect(rows).toHaveLength(2)` (reçoit 0), parce que les dates à slashes sont rejetées.

- [ ] **Step 3: Étendre `ParsedRow` et `toISODate`**

Dans `lib/cockpit/bnp-import.ts`, remplacer le type `ParsedRow` :

```ts
export type ParsedRow = {
  date: string; // ISO YYYY-MM-DD
  label: string;
  amount: number; // signé
  bnpCategory: string;
  bnpSubCategory: string;
  shortLabel: string;
  operationType: string;
};
```

et remplacer `toISODate` :

```ts
function toISODate(s: string): string {
  const m = String(s).trim().match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}
```

- [ ] **Step 4: Remplacer `parseBnpSheet` par une lecture des colonnes par nom**

Remplacer intégralement la fonction `parseBnpSheet` :

```ts
type ColumnIndex = {
  date: number;
  label: number;
  amount: number;
  bnpCategory: number;
  bnpSubCategory: number;
  shortLabel: number;
  operationType: number;
};

/** Repère les colonnes par leur en-tête, pour survivre aux changements de format BNP. */
function findColumns(header: string[]): ColumnIndex | null {
  const at = (pred: (h: string) => boolean): number =>
    header.findIndex((c) => pred(norm(c)));

  const cols: ColumnIndex = {
    date: at((h) => h === "date operation"),
    label: at((h) => h === "libelle operation"),
    amount: at((h) => h.startsWith("montant operation")),
    bnpCategory: at((h) => h === "categorie operation"),
    bnpSubCategory: at((h) => h === "sous categorie operation"),
    shortLabel: at((h) => h === "libelle court"),
    operationType: at((h) => h === "type operation"),
  };
  if (cols.date === -1 || cols.label === -1 || cols.amount === -1) return null;
  return cols;
}

const cell = (r: string[], i: number): string =>
  i >= 0 ? String(r[i] ?? "").trim() : "";

export function parseBnpSheet(rows: string[][]): ParsedRow[] {
  const headerIdx = rows.findIndex(
    (r) => Array.isArray(r) && r.some((c) => norm(c) === "date operation")
  );
  if (headerIdx === -1) return [];

  const cols = findColumns(rows[headerIdx]);
  if (!cols) return [];

  const out: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r)) continue;
    const date = toISODate(cell(r, cols.date));
    const amount = toAmount(cell(r, cols.amount));
    if (!date || !isFinite(amount)) continue;
    out.push({
      date,
      label: cell(r, cols.label),
      amount,
      bnpCategory: cell(r, cols.bnpCategory),
      bnpSubCategory: cell(r, cols.bnpSubCategory),
      shortLabel: cell(r, cols.shortLabel),
      operationType: cell(r, cols.operationType),
    });
  }
  return out;
}
```

Note : la garde `r.length < 5` de l'ancienne version disparaît — elle devient fausse dès que le nombre de colonnes change. La validation réelle est faite par `date` et `amount`, ce qui écarte déjà la ligne `["bad-row"]` du test historique.

- [ ] **Step 5: Lancer les tests**

Run: `npx vitest run lib/cockpit/bnp-import.test.ts`
Expected: PASS — anciens tests **et** nouveaux.

Run: `npx tsc --noEmit`
Expected: erreurs attendues dans `app/cockpit/import/page.tsx` si le code y construit un `ParsedRow` littéral. Si c'est le cas, ajouter `shortLabel: ""` et `operationType: ""` à cet endroit. Sinon, aucune erreur.

- [ ] **Step 6: Vérifier sur le fichier réel de l'utilisateur**

Créer un fichier temporaire `check-import.cjs` à la racine :

```js
const XLSX = require("xlsx");
const fs = require("fs");
const F = "C:/Users/jeffa/.claude/uploads/4fc127f8-f0a0-486a-a1b3-7c31157bc0d1/ef64c08e-E2438172.xls";
const wb = XLSX.read(new Uint8Array(fs.readFileSync(F)), { type: "array" });
const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
  header: 1, raw: false, defval: "",
});
console.log("lignes de grille:", grid.length);
console.log("en-tête:", JSON.stringify(grid[2]));
```

Run: `node check-import.cjs`
Expected: 999 lignes, en-tête `["Date operation","Libelle court","Type operation","Libelle operation","Montant operation en euro",""]`.

Puis supprimer le fichier : `rm check-import.cjs`. Il ne doit pas être commité.

- [ ] **Step 7: Commit**

```bash
git add lib/cockpit/bnp-import.ts lib/cockpit/bnp-import.test.ts
git commit -m "fix(import): map BNP columns by header name and accept slash dates

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Table `category_rules` et son API

**Files:**
- Create: `supabase/2026-08-31-category-rules.sql`
- Create: `lib/cockpit/category-rules-api.ts`
- Modify: `lib/cockpit/hooks.ts` (ajouter `useCategoryRules`)

**Interfaces:**
- Consumes: rien.
- Produces:
  - `type CategoryRule = { payee_key: string; category_id: string }`
  - `getCategoryRules(userId: string): Promise<CategoryRule[]>`
  - `setCategoryRule(userId: string, payeeKey: string, categoryId: string): Promise<void>`
  - `setCategoryRules(userId: string, rules: { payeeKey: string; categoryId: string }[]): Promise<void>` — écriture en lot, utilisée par la catégorisation en masse.
  - `deleteCategoryRule(userId: string, payeeKey: string): Promise<void>`
  - `useCategoryRules(userId: string)` → `{ rules: Map<string, string>, loaded: boolean, refetch: () => void }` (clé = `payee_key`, valeur = `category_id`).

- [ ] **Step 1: Écrire la migration**

Créer `supabase/2026-08-31-category-rules.sql` :

```sql
-- Règles de catégorisation par commerçant. À exécuter dans Supabase SQL editor.
create table if not exists public.category_rules (
  user_id uuid not null references auth.users(id),
  payee_key text not null,
  category_id uuid not null references public.categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, payee_key)
);

alter table public.category_rules enable row level security;

create policy "category_rules_per_user" on public.category_rules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Règles d'amorçage pour jeffalkhalid@gmail.com.
-- Les catégories sont résolues PAR NOM : un id codé en dur ne survivrait pas
-- d'une base à l'autre. Une règle dont la catégorie n'existe pas est ignorée.
insert into public.category_rules (user_id, payee_key, category_id)
select u.id, r.payee_key, c.id
from auth.users u
cross join (values
  ('carrefour banque',      'Courses alimentaires'),
  ('elior entretris',       'Restaurants & Sorties'),
  ('campus carrefou',       'Restaurants & Sorties'),
  ('campus carrefou massy', 'Restaurants & Sorties'),
  ('carrefour france',      'Salaire')
) as r(payee_key, category_name)
join public.categories c
  on c.name = r.category_name
 and (c.user_id is null or c.user_id = u.id)
where lower(u.email) = 'jeffalkhalid@gmail.com'
on conflict (user_id, payee_key) do nothing;
```

- [ ] **Step 2: Écrire l'API**

Créer `lib/cockpit/category-rules-api.ts` :

```ts
import { supabase } from "./supabase";

export type CategoryRule = { payee_key: string; category_id: string };

export async function getCategoryRules(
  userId: string
): Promise<CategoryRule[]> {
  const { data, error } = await supabase
    .from("category_rules")
    .select("payee_key,category_id")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data as CategoryRule[]) ?? [];
}

export async function setCategoryRule(
  userId: string,
  payeeKey: string,
  categoryId: string
): Promise<void> {
  const { error } = await supabase.from("category_rules").upsert(
    { user_id: userId, payee_key: payeeKey, category_id: categoryId },
    { onConflict: "user_id,payee_key" }
  );
  if (error) throw new Error(error.message);
}

/** Écriture en lot : une seule requête pour toute une sélection. */
export async function setCategoryRules(
  userId: string,
  rules: { payeeKey: string; categoryId: string }[]
): Promise<void> {
  if (!rules.length) return;
  const { error } = await supabase.from("category_rules").upsert(
    rules.map((r) => ({
      user_id: userId,
      payee_key: r.payeeKey,
      category_id: r.categoryId,
    })),
    { onConflict: "user_id,payee_key" }
  );
  if (error) throw new Error(error.message);
}

export async function deleteCategoryRule(
  userId: string,
  payeeKey: string
): Promise<void> {
  const { error } = await supabase
    .from("category_rules")
    .delete()
    .eq("user_id", userId)
    .eq("payee_key", payeeKey);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 3: Ajouter le hook**

Dans `lib/cockpit/hooks.ts`, ajouter l'import en tête de fichier :

```ts
import { getCategoryRules } from "./category-rules-api";
```

et le hook, à la suite de `useUserSettings` :

```ts
export function useCategoryRules(userId: string) {
  const [rules, setRules] = useState<Map<string, string>>(new Map());
  const [loaded, setLoaded] = useState(false);

  const refetch = useCallback(() => {
    getCategoryRules(userId)
      .then((rows) =>
        setRules(new Map(rows.map((r) => [r.payee_key, r.category_id])))
      )
      .catch((e) => {
        console.error("useCategoryRules: échec du chargement des règles", e);
        setRules(new Map());
      })
      .finally(() => setLoaded(true));
  }, [userId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { rules, loaded, refetch };
}
```

- [ ] **Step 4: Vérifier types et suite**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

Run: `npm run test`
Expected: PASS, suite inchangée.

- [ ] **Step 5: Commit**

```bash
git add supabase/2026-08-31-category-rules.sql lib/cockpit/category-rules-api.ts lib/cockpit/hooks.ts
git commit -m "feat(import): category_rules table, API and hook

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Cascade de classification

**Files:**
- Create: `lib/cockpit/classify.ts`
- Test: `lib/cockpit/classify.test.ts`

**Interfaces:**
- Consumes: `merchantKey` (Task 1) ; `ParsedRow` avec `shortLabel`/`operationType` (Task 2) ; `mapBnpCategory` et `classifyTransfer`/`targetCategoryName` existants.
- Produces:
  - `type Provenance = "rule" | "history" | "bnp" | "transfer" | "guess"`
  - `type ClassifiedRow = ParsedRow & { payeeKey: string; categoryName: string; provenance: Provenance }`
  - `function buildHistoryMap(txns: Txn[], categoryNameById: Map<string, string>): Map<string, string>`
  - `function classifyRows(rows: ParsedRow[], ctx: ClassifyContext): ClassifiedRow[]`
  - `type ClassifyContext = { rulesByKey: Map<string, string>; categoryNameById: Map<string, string>; historyByKey: Map<string, string> }`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `lib/cockpit/classify.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { buildHistoryMap, classifyRows } from "./classify";
import type { ParsedRow } from "./bnp-import";
import type { Txn } from "./types";

const row = (p: Partial<ParsedRow>): ParsedRow => ({
  date: "2025-08-07",
  label: "FACTURE CARTE DU 050825 ELIOR ENTRETRIS CARTE   4974XXXXXXXX4402",
  amount: -20,
  bnpCategory: "",
  bnpSubCategory: "",
  shortLabel: "PAIEMENT CB",
  operationType: "FACTURE CARTE",
  ...p,
});

const emptyCtx = {
  rulesByKey: new Map<string, string>(),
  categoryNameById: new Map<string, string>(),
  historyByKey: new Map<string, string>(),
};

describe("buildHistoryMap", () => {
  it("associe une clé commerçant à la catégorie majoritaire", () => {
    const txns: Txn[] = [
      { id: "1", date: "2025-01-01", amount: -10, description: "FACTURE CARTE DU 010125 ELIOR ENTRETRIS CARTE 4974", type: "expense", category_id: "resto" },
      { id: "2", date: "2025-02-01", amount: -12, description: "FACTURE CARTE DU 010225 ELIOR ENTRETRIS CARTE 4974", type: "expense", category_id: "resto" },
      { id: "3", date: "2025-03-01", amount: -14, description: "FACTURE CARTE DU 010325 ELIOR ENTRETRIS CARTE 4974", type: "expense", category_id: "courses" },
    ];
    const names = new Map([["resto", "Restaurants & Sorties"], ["courses", "Courses alimentaires"]]);
    const map = buildHistoryMap(txns, names);
    expect(map.get("elior entretris")).toBe("Restaurants & Sorties");
  });

  it("ignore les transactions sans catégorie", () => {
    const txns: Txn[] = [
      { id: "1", date: "2025-01-01", amount: -10, description: "X", type: "expense", category_id: null },
    ];
    expect(buildHistoryMap(txns, new Map()).size).toBe(0);
  });
});

describe("classifyRows — priorité de la cascade", () => {
  it("1. une règle explicite gagne sur tout le reste", () => {
    const [r] = classifyRows([row({ bnpCategory: "Revenus" })], {
      ...emptyCtx,
      rulesByKey: new Map([["elior entretris", "cat-resto"]]),
      categoryNameById: new Map([["cat-resto", "Restaurants & Sorties"]]),
      historyByKey: new Map([["elior entretris", "Courses alimentaires"]]),
    });
    expect(r.categoryName).toBe("Restaurants & Sorties");
    expect(r.provenance).toBe("rule");
  });

  it("2. l'historique gagne sur les catégories BNP", () => {
    const [r] = classifyRows([row({ bnpCategory: "Revenus" })], {
      ...emptyCtx,
      historyByKey: new Map([["elior entretris", "Restaurants & Sorties"]]),
    });
    expect(r.categoryName).toBe("Restaurants & Sorties");
    expect(r.provenance).toBe("history");
  });

  it("3. les catégories BNP servent quand l'export les fournit", () => {
    const [r] = classifyRows(
      [row({ bnpCategory: "Revenus", bnpSubCategory: "Salaire" })],
      emptyCtx
    );
    expect(r.categoryName).toBe("Salaire");
    expect(r.provenance).toBe("bnp");
  });

  it("4. un virement passe par classifyTransfer", () => {
    const [r] = classifyRows(
      [
        row({
          label: "VIR SEPA INST EMIS /MOTIF EPARGNE /BEN LIVRET A",
          operationType: "VIR SEPA INST EMIS",
          amount: -500,
        }),
      ],
      emptyCtx
    );
    expect(r.provenance).toBe("transfer");
  });

  it("5. sinon, devinette timide : COMMISSIONS en Frais bancaires", () => {
    const [r] = classifyRows(
      [row({ label: "COMMISSIONS COTISATION", operationType: "COMMISSIONS", shortLabel: "COMMISSIONS" })],
      emptyCtx
    );
    expect(r.categoryName).toBe("Frais bancaires");
    expect(r.provenance).toBe("guess");
  });

  it("5. tout le reste tombe en Autres, jamais en Courses alimentaires", () => {
    const [r] = classifyRows([row({})], emptyCtx);
    expect(r.categoryName).toBe("Autres");
    expect(r.provenance).toBe("guess");
  });

  it("expose la clé commerçant de chaque ligne", () => {
    const [r] = classifyRows([row({})], emptyCtx);
    expect(r.payeeKey).toBe("elior entretris");
  });

  it("ignore une règle pointant vers une catégorie inconnue", () => {
    const [r] = classifyRows([row({})], {
      ...emptyCtx,
      rulesByKey: new Map([["elior entretris", "cat-supprimee"]]),
    });
    expect(r.provenance).toBe("guess");
    expect(r.categoryName).toBe("Autres");
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/cockpit/classify.test.ts`
Expected: FAIL — « Failed to resolve import "./classify" ».

- [ ] **Step 3: Écrire le module**

Créer `lib/cockpit/classify.ts` :

```ts
import type { ParsedRow } from "./bnp-import";
import { mapBnpCategory } from "./bnp-import";
import { merchantKey } from "./payee-key";
import { classifyTransfer, targetCategoryName } from "./classify-transfer";
import type { Txn } from "./types";

export type Provenance = "rule" | "history" | "bnp" | "transfer" | "guess";

export type ClassifiedRow = ParsedRow & {
  payeeKey: string;
  categoryName: string;
  provenance: Provenance;
};

export type ClassifyContext = {
  /** payee_key → category_id, décisions explicites de l'utilisateur. */
  rulesByKey: Map<string, string>;
  /** category_id → nom, pour résoudre les règles. */
  categoryNameById: Map<string, string>;
  /** payee_key → nom de catégorie, appris de l'historique. */
  historyByKey: Map<string, string>;
};

/** Catégorie neutre où atterrit tout ce que la cascade ne sait pas classer. */
export const FALLBACK_CATEGORY = "Autres";

/**
 * Apprend, depuis les transactions déjà catégorisées, quelle catégorie
 * l'utilisateur associe à chaque commerçant. En cas d'hésitation, la catégorie
 * la plus fréquente gagne.
 */
export function buildHistoryMap(
  txns: Txn[],
  categoryNameById: Map<string, string>
): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const t of txns) {
    if (!t.category_id) continue;
    const name = categoryNameById.get(t.category_id);
    if (!name) continue;
    const key = merchantKey(t.description);
    if (!key) continue;
    const byName = counts.get(key) ?? new Map<string, number>();
    byName.set(name, (byName.get(name) ?? 0) + 1);
    counts.set(key, byName);
  }
  const out = new Map<string, string>();
  for (const [key, byName] of counts) {
    let best = "";
    let bestN = -1;
    for (const [name, n] of byName) {
      if (n > bestN) {
        bestN = n;
        best = name;
      }
    }
    if (best) out.set(key, best);
  }
  return out;
}

const isTransferLabel = (r: ParsedRow): boolean =>
  /^VIR|^VIREMENT/i.test(r.operationType || r.shortLabel || r.label);

/** Devinette volontairement timide : seuls les frais bancaires sont devinés. */
function guess(r: ParsedRow): string {
  const t = (r.operationType || r.shortLabel || "").toUpperCase();
  if (t.includes("COMMISSION")) return "Frais bancaires";
  return FALLBACK_CATEGORY;
}

export function classifyRows(
  rows: ParsedRow[],
  ctx: ClassifyContext
): ClassifiedRow[] {
  return rows.map((r) => {
    const payeeKey = merchantKey(r.label);

    // 1. Règle explicite
    const ruleCatId = ctx.rulesByKey.get(payeeKey);
    if (ruleCatId) {
      const name = ctx.categoryNameById.get(ruleCatId);
      if (name) return { ...r, payeeKey, categoryName: name, provenance: "rule" };
    }

    // 2. Historique
    const fromHistory = ctx.historyByKey.get(payeeKey);
    if (fromHistory) {
      return { ...r, payeeKey, categoryName: fromHistory, provenance: "history" };
    }

    // 3. Catégories BNP, quand l'export les fournit
    if (r.bnpCategory || r.bnpSubCategory) {
      return {
        ...r,
        payeeKey,
        categoryName: mapBnpCategory(r.bnpCategory, r.bnpSubCategory),
        provenance: "bnp",
      };
    }

    // 4. Virements
    if (isTransferLabel(r)) {
      return {
        ...r,
        payeeKey,
        categoryName: targetCategoryName(
          classifyTransfer(r.amount, r.label),
          r.label
        ),
        provenance: "transfer",
      };
    }

    // 5. Devinette
    return { ...r, payeeKey, categoryName: guess(r), provenance: "guess" };
  });
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run lib/cockpit/classify.test.ts`
Expected: PASS (10 tests).

Run: `npm run test` puis `npx tsc --noEmit`
Expected: PASS, aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/classify.ts lib/cockpit/classify.test.ts
git commit -m "feat(import): five-level classification cascade with provenance

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Logique pure de sélection en masse

Isolée de l'UI pour être testable seule. La Task 7 la branche sur l'écran.

**Files:**
- Create: `lib/cockpit/bulk-select.ts`
- Test: `lib/cockpit/bulk-select.test.ts`

**Interfaces:**
- Consumes: `ClassifiedRow` (Task 4).
- Produces:
  - `function applyCategoryToSelection<T extends { payeeKey: string; categoryName: string }>(rows: T[], selected: Set<number>, categoryName: string): T[]`
  - `function rulesFromSelection<T extends { payeeKey: string }>(rows: T[], selected: Set<number>, categoryId: string): { payeeKey: string; categoryId: string }[]`
  - `function bulkSummary(lineCount: number, ruleCount: number, categoryName: string): string`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `lib/cockpit/bulk-select.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import {
  applyCategoryToSelection,
  rulesFromSelection,
  bulkSummary,
} from "./bulk-select";

const rows = [
  { payeeKey: "elior entretris", categoryName: "Autres" },
  { payeeKey: "uber trip", categoryName: "Autres" },
  { payeeKey: "elior entretris", categoryName: "Autres" },
  { payeeKey: "carrefour banque", categoryName: "Courses alimentaires" },
];

describe("applyCategoryToSelection", () => {
  it("ne change que les lignes sélectionnées", () => {
    const out = applyCategoryToSelection(rows, new Set([0, 1]), "Restaurants & Sorties");
    expect(out[0].categoryName).toBe("Restaurants & Sorties");
    expect(out[1].categoryName).toBe("Restaurants & Sorties");
    expect(out[2].categoryName).toBe("Autres");
    expect(out[3].categoryName).toBe("Courses alimentaires");
  });

  it("ne mute pas le tableau d'origine", () => {
    applyCategoryToSelection(rows, new Set([0]), "X");
    expect(rows[0].categoryName).toBe("Autres");
  });

  it("une sélection vide ne change rien", () => {
    expect(applyCategoryToSelection(rows, new Set(), "X")).toEqual(rows);
  });
});

describe("rulesFromSelection", () => {
  it("produit une règle par commerçant distinct", () => {
    const out = rulesFromSelection(rows, new Set([0, 1, 2]), "cat-1");
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.payeeKey).sort()).toEqual(["elior entretris", "uber trip"]);
    expect(out.every((r) => r.categoryId === "cat-1")).toBe(true);
  });

  it("ignore les clés vides", () => {
    const out = rulesFromSelection([{ payeeKey: "" }], new Set([0]), "cat-1");
    expect(out).toEqual([]);
  });

  it("une sélection vide ne produit aucune règle", () => {
    expect(rulesFromSelection(rows, new Set(), "cat-1")).toEqual([]);
  });
});

describe("bulkSummary", () => {
  it("annonce lignes et règles au pluriel", () => {
    expect(bulkSummary(47, 12, "Restaurants & Sorties")).toBe(
      "47 lignes classées en Restaurants & Sorties, 12 règles créées"
    );
  });
  it("gère le singulier", () => {
    expect(bulkSummary(1, 1, "Autres")).toBe(
      "1 ligne classée en Autres, 1 règle créée"
    );
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/cockpit/bulk-select.test.ts`
Expected: FAIL — « Failed to resolve import "./bulk-select" ».

- [ ] **Step 3: Écrire le module**

Créer `lib/cockpit/bulk-select.ts` :

```ts
/** Applique une catégorie aux seules lignes sélectionnées, sans muter l'entrée. */
export function applyCategoryToSelection<
  T extends { payeeKey: string; categoryName: string },
>(rows: T[], selected: Set<number>, categoryName: string): T[] {
  if (!selected.size) return rows;
  return rows.map((r, i) => (selected.has(i) ? { ...r, categoryName } : r));
}

/**
 * Une règle par commerçant distinct de la sélection : classer 47 lignes
 * Restaurants n'enseigne pas 47 fois la même chose, mais une fois par commerçant.
 */
export function rulesFromSelection<T extends { payeeKey: string }>(
  rows: T[],
  selected: Set<number>,
  categoryId: string
): { payeeKey: string; categoryId: string }[] {
  const keys = new Set<string>();
  for (const i of selected) {
    const key = rows[i]?.payeeKey;
    if (key) keys.add(key);
  }
  return [...keys].map((payeeKey) => ({ payeeKey, categoryId }));
}

export function bulkSummary(
  lineCount: number,
  ruleCount: number,
  categoryName: string
): string {
  const l = lineCount > 1 ? "lignes classées" : "ligne classée";
  const r = ruleCount > 1 ? "règles créées" : "règle créée";
  return `${lineCount} ${l} en ${categoryName}, ${ruleCount} ${r}`;
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run lib/cockpit/bulk-select.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/bulk-select.ts lib/cockpit/bulk-select.test.ts
git commit -m "feat(import): pure bulk-selection helpers with rule derivation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Brancher la classification sur la page d'import

**Files:**
- Modify: `app/cockpit/import/page.tsx`

**Interfaces:**
- Consumes: `classifyRows`, `buildHistoryMap`, `FALLBACK_CATEGORY` (Task 4) ; `useCategoryRules` (Task 3) ; `merchantKey` (Task 1) ; `useAllTransactions` et `useCategories` existants.
- Produces: `rows` de l'état de la page portent désormais `payeeKey` et `provenance`, consommés par la Task 7.

- [ ] **Step 1: Remplacer la classification ad hoc par la cascade**

Dans `app/cockpit/import/page.tsx`, ajouter les imports :

```ts
import { classifyRows, buildHistoryMap, FALLBACK_CATEGORY } from "@/lib/cockpit/classify";
import { useCategoryRules } from "@/lib/cockpit/hooks";
import { merchantKey } from "@/lib/cockpit/payee-key";
```

Dans le composant, à côté des hooks existants :

```ts
  const { rules, refetch: refetchRules } = useCategoryRules(user.id);
  const { txns: allTxns } = useAllTransactions();
```

(si `useAllTransactions` est déjà utilisé dans ce fichier, ne pas le dupliquer.)

Dans `handleFile`, remplacer tout le bloc qui va de `const reviewed = markDuplicates(...)` jusqu'à `setRows(...)` par :

```ts
      const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
      const historyByKey = buildHistoryMap(allTxns, categoryNameById);
      const classified = classifyRows(parsed, {
        rulesByKey: rules,
        categoryNameById,
        historyByKey,
      });
      const reviewed = classified.map((c) => ({
        ...c,
        duplicate: existing.has(rowKey(c.date, c.amount)),
      }));
      setRows(reviewed.map((r) => ({ ...r, include: !r.duplicate })));
```

`markDuplicates` n'est plus appelée ici : la cascade remplace son `mapBnpCategory`, et le marquage des doublons se fait sur place. Laisser la fonction dans `bnp-import.ts` — elle reste testée et exportée, et la retirer dépasserait le périmètre de cette tâche.

- [ ] **Step 2: Rendre la résolution de catégorie tolérante à l'import**

Remplacer la boucle de `doImport` qui échoue sur une catégorie non résolue :

```ts
    const importRows: ImportRow[] = [];
    const unresolved: string[] = [];
    for (const r of rows.filter((x) => x.include)) {
      const cat =
        categories.find((c) => c.name === r.categoryName) ??
        categories.find((c) => c.name === FALLBACK_CATEGORY);
      if (!cat) {
        unresolved.push(r.categoryName);
        continue;
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
    if (unresolved.length) {
      setError(
        `${unresolved.length} ligne(s) ignorée(s) : catégorie introuvable et « ${FALLBACK_CATEGORY} » absente de vos catégories.`
      );
    }
    if (!importRows.length) return;
```

Une catégorie inconnue ne fait plus échouer l'import entier : les lignes concernées sont écartées et signalées.

- [ ] **Step 3: Utiliser `merchantKey` pour les engagements créés à l'import**

Toujours dans `doImport`, remplacer `const key = normalizePayee(payee);` par :

```ts
        const key = merchantKey(payee);
```

et retirer l'import désormais inutile de `normalizePayee` s'il ne sert plus dans ce fichier.

- [ ] **Step 4: Rafraîchir les règles après import**

Juste avant `router.push("/cockpit")`, ajouter :

```ts
      refetchRules();
```

- [ ] **Step 5: Vérifier**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

Run: `npm run test`
Expected: PASS.

Run: `npm run build`
Expected: build réussi.

- [ ] **Step 6: Commit**

```bash
git add app/cockpit/import/page.tsx
git commit -m "feat(import): classify parsed rows through the cascade

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Écran de revue — provenance, filtre, sélection multiple, tenue de charge

La tâche la plus lourde du plan. Elle est indivisible : le filtre, la sélection et l'allègement du DOM se tiennent — livrer la sélection multiple sans supprimer les 996 `<select>` donnerait une fonctionnalité injouable sur mobile.

**Files:**
- Create: `components/cockpit/import/CategoryPickerSheet.tsx`
- Create: `components/cockpit/import/BulkBar.tsx`
- Modify: `components/cockpit/import/ReviewRow.tsx`
- Modify: `components/cockpit/import/ReviewTable.tsx`
- Modify: `app/cockpit/import/page.tsx`

**Interfaces:**
- Consumes: `Provenance`, `ClassifiedRow` (Task 4) ; `applyCategoryToSelection`, `rulesFromSelection`, `bulkSummary` (Task 5) ; `setCategoryRules`, `setCategoryRule` (Task 3).
- Produces: rien pour les tâches suivantes.

- [ ] **Step 1: Feuille de choix de catégorie partagée**

Créer `components/cockpit/import/CategoryPickerSheet.tsx` :

```tsx
"use client";

import type { Category } from "@/lib/cockpit/types";

export function CategoryPickerSheet({
  categories,
  title,
  onPick,
  onClose,
}: {
  categories: Category[];
  title: string;
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/50 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="bg-paper w-full max-w-[600px] max-h-[80vh] overflow-auto px-6 pt-6 pb-10 rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-center mb-4">
          <h2 className="font-display text-xl">{title}</h2>
          <button className="text-ink-muted text-sm" onClick={onClose} type="button">
            Fermer
          </button>
        </header>
        <div className="grid gap-1">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick(c.name)}
              className="flex items-center gap-2 text-left py-3 px-2 rounded-lg text-ink text-[15px] border-b border-rule"
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: c.color }}
              />
              {c.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Barre d'action de masse**

Créer `components/cockpit/import/BulkBar.tsx` :

```tsx
"use client";

import { X } from "lucide-react";

export function BulkBar({
  count,
  onPick,
  onClear,
}: {
  count: number;
  onPick: () => void;
  onClear: () => void;
}) {
  if (!count) return null;
  return (
    <div className="sticky bottom-0 z-20 -mx-5 px-5 py-3 bg-card border-t border-rule flex items-center gap-3">
      <span className="text-[13px] text-ink font-medium">
        {count} sélectionnée{count > 1 ? "s" : ""}
      </span>
      <button
        type="button"
        onClick={onPick}
        className="ml-auto bg-emerald text-paper rounded-lg px-4 py-2.5 text-[13px] font-semibold"
      >
        Catégoriser
      </button>
      <button
        type="button"
        aria-label="Tout désélectionner"
        onClick={onClear}
        className="text-ink-muted p-2"
      >
        <X size={16} />
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Ligne de revue — badge de provenance, case de sélection, bouton catégorie**

Dans `components/cockpit/import/ReviewRow.tsx`, ajouter en tête :

```tsx
import type { Provenance } from "@/lib/cockpit/classify";

const PROVENANCE_LABEL: Record<Provenance, string> = {
  rule: "règle",
  history: "historique",
  bnp: "BNP",
  transfer: "virement",
  guess: "deviné",
};
```

Étendre les props du composant avec :

```tsx
  provenance: Provenance;
  selected: boolean;
  onToggleSelected: (v: boolean) => void;
  onOpenPicker: () => void;
```

Remplacer le `<select>` de catégorie de la ligne par un bouton qui ouvre la feuille partagée :

```tsx
        <button
          type="button"
          onClick={onOpenPicker}
          className={`text-left text-[13px] px-2 py-1.5 rounded-lg border border-rule bg-card ${
            resolved ? "text-ink" : "text-accent"
          }`}
        >
          {row.categoryName || "Choisir…"}
        </button>
```

Ajouter, à côté de la date, le badge de provenance :

```tsx
            <span className="ml-1 text-[10px] uppercase tracking-wide text-ink-muted border border-rule rounded px-1 py-0.5">
              {PROVENANCE_LABEL[provenance]}
            </span>
```

Ajouter la case de sélection, **explicitement libellée**, en tête de ligne, pour qu'elle ne se confonde pas avec la case « inclure » existante :

```tsx
        <label className="flex items-center gap-1 text-[11px] text-ink-muted shrink-0">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onToggleSelected(e.target.checked)}
          />
          sél.
        </label>
```

- [ ] **Step 4: Tableau — filtre, tout sélectionner, tranches de 100**

Dans `components/cockpit/import/ReviewTable.tsx`, étendre les props :

```tsx
  guessOnly: boolean;
  onGuessOnly: (v: boolean) => void;
  selected: Set<number>;
  onToggleSelected: (index: number, v: boolean) => void;
  onSelectAllVisible: () => void;
  onClearSelection: () => void;
  onOpenPicker: (index: number) => void;
  onBulkPick: () => void;
```

Calculer les index visibles et la tranche affichée :

```tsx
  const [shown, setShown] = useState(100);
  const visible = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => (guessOnly ? r.provenance === "guess" : true));
  const slice = visible.slice(0, shown);
  const guesses = rows.filter((r) => r.provenance === "guess").length;
```

Au-dessus de la liste, le filtre et le « tout sélectionner » :

```tsx
      <div className="flex items-center gap-3 mb-3 text-[13px]">
        <label className="flex items-center gap-1.5 text-ink-muted">
          <input
            type="checkbox"
            checked={guessOnly}
            onChange={(e) => onGuessOnly(e.target.checked)}
          />
          Devinettes seulement ({guesses})
        </label>
        <button
          type="button"
          onClick={onSelectAllVisible}
          className="ml-auto text-ink underline"
        >
          Tout sélectionner ({visible.length})
        </button>
      </div>
```

Rendre la tranche, en passant l'index **réel** de la ligne :

```tsx
        {slice.map(({ r, i }) => (
          <ReviewRow
            key={`${r.date}-${i}`}
            row={r}
            categories={categories}
            provenance={r.provenance}
            selected={selected.has(i)}
            onToggleSelected={(v) => onToggleSelected(i, v)}
            onOpenPicker={() => onOpenPicker(i)}
            onCategory={(name) => onCategory(i, name)}
            onToggleInclude={(v) => onToggleInclude(i, v)}
            engagementKnown={
              r.amount < 0 &&
              isEngagement(r.label || r.categoryName, engagementKeys)
            }
            engagement={!!r.engagement}
            onToggleEngagement={(v) => onToggleEngagement(i, v)}
          />
        ))}
```

Sous la liste, le bouton d'extension :

```tsx
        {slice.length < visible.length && (
          <button
            type="button"
            onClick={() => setShown((n) => n + 100)}
            className="w-full py-3 text-[13px] text-ink-muted border border-rule rounded-lg mt-2"
          >
            Afficher 100 de plus ({visible.length - slice.length} restantes)
          </button>
        )}
```

Enfin, la barre de masse juste avant le bouton d'import :

```tsx
      <BulkBar count={selected.size} onPick={onBulkPick} onClear={onClearSelection} />
```

Ajouter les imports nécessaires en tête du fichier : `useState` depuis React, `BulkBar` depuis `./BulkBar`.

**Important** : `onSelectAllVisible` sélectionne **tous les index de `visible`**, pas seulement ceux de `slice` — sinon le bouton mentirait sur ce qu'il sélectionne. Le calcul se fait dans la page (Step 5), qui détient l'état.

- [ ] **Step 5: Page d'import — état de sélection, filtre et application en masse**

Dans `app/cockpit/import/page.tsx`, ajouter l'état :

```ts
  const [guessOnly, setGuessOnly] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pickerFor, setPickerFor] = useState<number | "bulk" | null>(null);
```

et les gestionnaires :

```ts
  const toggleSelected = (i: number, v: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (v) next.add(i);
      else next.delete(i);
      return next;
    });

  const selectAllVisible = () =>
    setSelected(
      new Set(
        (rows ?? [])
          .map((r, i) => ({ r, i }))
          .filter(({ r }) => (guessOnly ? r.provenance === "guess" : true))
          .map(({ i }) => i)
      )
    );

  const pickCategory = async (name: string) => {
    if (!rows || pickerFor === null) return;
    const cat = categories.find((c) => c.name === name);
    if (pickerFor === "bulk") {
      const next = applyCategoryToSelection(rows, selected, name);
      setRows(next);
      if (cat) {
        const newRules = rulesFromSelection(rows, selected, cat.id);
        try {
          await setCategoryRules(user.id, newRules);
          refetchRules();
          setNotice(bulkSummary(selected.size, newRules.length, name));
        } catch (e) {
          setError(e instanceof Error ? e.message : "Erreur");
        }
      }
      setSelected(new Set());
    } else {
      const i = pickerFor;
      const key = rows[i].payeeKey;
      setRows((rs) =>
        rs ? rs.map((r) => (r.payeeKey === key ? { ...r, categoryName: name } : r)) : rs
      );
      if (cat && key) {
        try {
          await setCategoryRule(user.id, key, cat.id);
          refetchRules();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Erreur");
        }
      }
    }
    setPickerFor(null);
  };
```

Ajouter un état `notice` (`const [notice, setNotice] = useState("")`) et l'afficher sous le titre :

```tsx
      {notice && <p className="text-[13px] text-emerald mb-3">{notice}</p>}
```

Rendre la feuille quand elle est demandée :

```tsx
      {pickerFor !== null && (
        <CategoryPickerSheet
          categories={categories}
          title={pickerFor === "bulk" ? `Catégoriser ${selected.size} lignes` : "Choisir la catégorie"}
          onPick={pickCategory}
          onClose={() => setPickerFor(null)}
        />
      )}
```

et passer à `ReviewTable` les huit props ajoutées au Step 4 :

```tsx
          guessOnly={guessOnly}
          onGuessOnly={setGuessOnly}
          selected={selected}
          onToggleSelected={toggleSelected}
          onSelectAllVisible={selectAllVisible}
          onClearSelection={() => setSelected(new Set())}
          onOpenPicker={(i) => setPickerFor(i)}
          onBulkPick={() => setPickerFor("bulk")}
```

Imports à ajouter : `applyCategoryToSelection`, `rulesFromSelection`, `bulkSummary` depuis `@/lib/cockpit/bulk-select` ; `setCategoryRule`, `setCategoryRules` depuis `@/lib/cockpit/category-rules-api` ; `CategoryPickerSheet` depuis `@/components/cockpit/import/CategoryPickerSheet`.

Noter que **corriger une seule ligne réaffecte toutes les lignes du même commerçant** (`r.payeeKey === key`) : c'est ce qui rend les 149 lignes Carrefour Banque corrigeables d'un geste.

- [ ] **Step 6: Vérifier**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

Run: `npm run test`
Expected: PASS, snapshots de `lib/simulator.test.ts` intacts.

Run: `npm run build`
Expected: build réussi.

- [ ] **Step 7: Commit**

```bash
git add components/cockpit/import/ app/cockpit/import/page.tsx
git commit -m "feat(import): provenance badges, guess filter, bulk selection and chunked rendering

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Engagements récurrents sur la clé commerçant

Tâche la plus risquée : elle touche une fonctionnalité qui marche. À faire en dernier.

**Files:**
- Modify: `lib/cockpit/recurring-detect.ts`
- Modify: `lib/cockpit/recurring-match.ts`
- Modify: `components/cockpit/TxnModal.tsx`
- Create: `lib/cockpit/recurring-rekey.ts`
- Test: `lib/cockpit/recurring-rekey.test.ts`
- Modify: `lib/cockpit/recurring-charges-api.ts`
- Modify: `components/cockpit/ReglagesModal.tsx`

**Interfaces:**
- Consumes: `merchantKey` (Task 1) ; `RecurringCharge` existant.
- Produces:
  - `function planRekey(charges: { id: string; payee_key: string; label: string; expected_amount: number; created_at: string }[]): { updates: { id: string; payeeKey: string }[]; deletes: string[] }`
  - `deleteRecurringCharges(ids: string[]): Promise<void>`
  - `updateRecurringChargeKey(id: string, payeeKey: string): Promise<void>`

- [ ] **Step 1: Écrire les tests de la planification de re-clé**

Créer `lib/cockpit/recurring-rekey.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { planRekey } from "./recurring-rekey";

const c = (
  id: string,
  payee_key: string,
  label: string,
  created_at: string
) => ({ id, payee_key, label, expected_amount: 10, created_at });

describe("planRekey", () => {
  it("ne touche pas une charge dont la clé est déjà correcte", () => {
    const plan = planRekey([
      c("1", "retrait dab", "RETRAIT DAB 23/08/25 09H26 CACHAN", "2026-01-01"),
    ]);
    expect(plan.updates).toEqual([]);
    expect(plan.deletes).toEqual([]);
  });

  it("recalcule une clé obsolète", () => {
    const plan = planRekey([
      c(
        "1",
        "prlv sepa wellness training ech id emetteur fr zzz mdt rumwe ref wel gmqbjb g lib",
        "PRLV SEPA WELLNESS TRAINING ECH/020925 ID EMETTEUR/FR80ZZZ509663 MDT/RUMWE543014101 REF/WEL-09-4224131-GMQBJB3G LIB/X",
        "2026-01-01"
      ),
    ]);
    expect(plan.updates).toEqual([{ id: "1", payeeKey: "wellness training" }]);
    expect(plan.deletes).toEqual([]);
  });

  it("fusionne les collisions en gardant la plus récente", () => {
    const plan = planRekey([
      c(
        "vieux",
        "cle-a",
        "PRLV SEPA FONCIA VAL DE MARNE GERANCE ECH/211025 ID EMETTEUR/FR62ZZZ431223 MDT/W1 REF/E2E-1 LIB/X",
        "2026-01-01"
      ),
      c(
        "recent",
        "cle-b",
        "PRLV SEPA FONCIA VAL DE MARNE GERANCE ECH/211125 ID EMETTEUR/FR62ZZZ431223 MDT/W1 REF/E2E-2 LIB/X",
        "2026-02-01"
      ),
    ]);
    expect(plan.updates).toEqual([
      { id: "recent", payeeKey: "foncia val de marne gerance" },
    ]);
    expect(plan.deletes).toEqual(["vieux"]);
  });

  it("est idempotent : rejouer le plan ne change plus rien", () => {
    const already = [
      c(
        "1",
        "foncia val de marne gerance",
        "PRLV SEPA FONCIA VAL DE MARNE GERANCE ECH/211025 ID EMETTEUR/FR62ZZZ431223 MDT/W1 REF/E2E-1 LIB/X",
        "2026-01-01"
      ),
    ];
    const plan = planRekey(already);
    expect(plan.updates).toEqual([]);
    expect(plan.deletes).toEqual([]);
  });

  it("ignore les charges dont le libellé ne produit aucune clé", () => {
    const plan = planRekey([c("1", "x", "", "2026-01-01")]);
    expect(plan.updates).toEqual([]);
    expect(plan.deletes).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/cockpit/recurring-rekey.test.ts`
Expected: FAIL — « Failed to resolve import "./recurring-rekey" ».

- [ ] **Step 3: Écrire le module**

Créer `lib/cockpit/recurring-rekey.ts` :

```ts
import { merchantKey } from "./payee-key";

export type RekeyInput = {
  id: string;
  payee_key: string;
  label: string;
  expected_amount: number;
  created_at: string;
};

export type RekeyPlan = {
  updates: { id: string; payeeKey: string }[];
  deletes: string[];
};

/**
 * Recalcule les clés des engagements existants avec `merchantKey`.
 *
 * Plusieurs anciennes clés peuvent converger vers une seule — c'est l'effet
 * recherché — mais la contrainte `unique (user_id, payee_key)` interdit deux
 * lignes de même clé : on garde la plus récente et on supprime les autres.
 */
export function planRekey(charges: RekeyInput[]): RekeyPlan {
  const byNewKey = new Map<string, RekeyInput[]>();
  for (const ch of charges) {
    const key = merchantKey(ch.label);
    if (!key) continue;
    const list = byNewKey.get(key) ?? [];
    list.push(ch);
    byNewKey.set(key, list);
  }

  const updates: { id: string; payeeKey: string }[] = [];
  const deletes: string[] = [];

  for (const [key, list] of byNewKey) {
    const sorted = [...list].sort((a, b) =>
      a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0
    );
    const keep = sorted[0];
    for (const ch of sorted.slice(1)) deletes.push(ch.id);
    if (keep.payee_key !== key) updates.push({ id: keep.id, payeeKey: key });
  }

  return { updates, deletes };
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run lib/cockpit/recurring-rekey.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Basculer la détection et le matching sur `merchantKey`**

Dans `lib/cockpit/recurring-detect.ts` :
- ajouter `import { merchantKey } from "./payee-key";` (l'import de `normalizePayee` et sa ré-export restent, d'autres fichiers en dépendent) ;
- dans `detectRecurring`, remplacer `const key = normalizePayee(t.description);` par `const key = merchantKey(t.description);` ;
- dans `isEngagement`, remplacer `return keys.has(normalizePayee(description));` par `return keys.has(merchantKey(description));`.

Dans `lib/cockpit/recurring-match.ts`, remplacer l'import `normalizePayee` par `merchantKey` (depuis `./payee-key`) et l'appel `const k = normalizePayee(t.description);` par `const k = merchantKey(t.description);`.

Dans `components/cockpit/TxnModal.tsx`, remplacer `payeeKey: normalizePayee(payeeOf),` par `payeeKey: merchantKey(payeeOf),` et corriger l'import en conséquence (`merchantKey` depuis `@/lib/cockpit/payee-key`, `isEngagement` reste depuis `@/lib/cockpit/recurring-detect`).

- [ ] **Step 6: Lancer les tests des modules touchés**

Run: `npx vitest run lib/cockpit/recurring-detect.test.ts lib/cockpit/recurring-match.test.ts`
Expected: PASS. Si un test échoue parce qu'il attendait une clé issue de `normalizePayee` sur un libellé de type `PRLV SEPA …`, c'est le **changement voulu** : mettre à jour la valeur attendue du test et le noter dans le rapport. Ne pas modifier un test dont l'échec révèle autre chose.

- [ ] **Step 7: API de re-clé**

Il n'existe **aucune** fonction de lecture des engagements dans `recurring-charges-api.ts` : la
lecture se fait aujourd'hui en ligne dans le hook `useRecurringCharges` (`lib/cockpit/hooks.ts`),
qui filtre `active = true` et ne sélectionne pas `created_at`. La re-clé a besoin des deux :
`created_at` pour arbitrer les fusions, et **les charges inactives aussi** — une inactive gardant
son ancienne clé pourrait entrer en collision plus tard. Il faut donc une fonction dédiée.

Dans `lib/cockpit/recurring-charges-api.ts`, ajouter :

```ts
/** Ligne complète, y compris les charges inactives et created_at : pour la re-clé. */
export type RecurringChargeRow = {
  id: string;
  payee_key: string;
  label: string;
  expected_amount: number;
  created_at: string;
};

export async function listAllRecurringCharges(
  userId: string
): Promise<RecurringChargeRow[]> {
  const { data, error } = await supabase
    .from("recurring_charges")
    .select("id,payee_key,label,expected_amount,created_at")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data as RecurringChargeRow[]) ?? [];
}

export async function updateRecurringChargeKey(
  id: string,
  payeeKey: string
): Promise<void> {
  const { error } = await supabase
    .from("recurring_charges")
    .update({ payee_key: payeeKey })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteRecurringCharges(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase
    .from("recurring_charges")
    .delete()
    .in("id", ids);
  if (error) throw new Error(error.message);
}
```

`RecurringChargeRow` correspond exactement au type `RekeyInput` attendu par `planRekey`.

**Ordre d'exécution obligatoire** : les suppressions **avant** les mises à jour, sinon la contrainte
d'unicité rejette une mise à jour vers une clé encore occupée par une ligne à supprimer.

- [ ] **Step 8: Bouton dans Réglages**

Dans `components/cockpit/ReglagesModal.tsx`, ajouter un bouton sous « Gérer les catégories » :

```tsx
          <button
            type="button"
            onClick={rekey}
            disabled={rekeying}
            className="text-ink text-sm py-2 text-left disabled:opacity-60"
          >
            {rekeying ? "Recalcul…" : "Recalculer les clés d'engagement"}
          </button>
          {rekeyNote && <p className="text-[13px] text-ink-muted">{rekeyNote}</p>}
```

avec, dans le composant :

```tsx
  const [rekeying, setRekeying] = useState(false);
  const [rekeyNote, setRekeyNote] = useState("");

  const rekey = async () => {
    setRekeying(true);
    setRekeyNote("");
    try {
      const charges = await listAllRecurringCharges(userId);
      const plan = planRekey(charges);
      await deleteRecurringCharges(plan.deletes);
      for (const u of plan.updates) {
        await updateRecurringChargeKey(u.id, u.payeeKey);
      }
      setRekeyNote(
        `${charges.length} engagement(s), ${plan.updates.length} re-clé(s), ${plan.deletes.length} fusionné(s).`
      );
    } catch (e) {
      setRekeyNote(e instanceof Error ? e.message : "Erreur");
    }
    setRekeying(false);
  };
```

Ajouter les imports : `planRekey` depuis `@/lib/cockpit/recurring-rekey` ; `listAllRecurringCharges`, `updateRecurringChargeKey` et `deleteRecurringCharges` depuis `@/lib/cockpit/recurring-charges-api` (les trois sont créées au Step 7). `ReglagesModal` reçoit déjà `userId` en prop — l'utiliser tel quel.

- [ ] **Step 9: Vérifier**

Run: `npm run test`
Expected: PASS.

Run: `npx tsc --noEmit` puis `npm run build`
Expected: aucune erreur, build réussi.

- [ ] **Step 10: Commit**

```bash
git add lib/cockpit/recurring-rekey.ts lib/cockpit/recurring-rekey.test.ts lib/cockpit/recurring-detect.ts lib/cockpit/recurring-match.ts lib/cockpit/recurring-charges-api.ts components/cockpit/TxnModal.tsx components/cockpit/ReglagesModal.tsx
git commit -m "feat(engagements): switch recurring detection to merchantKey with rekey migration

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 11: Smoke test manuel (à faire par l'utilisateur)**

1. Exécuter `supabase/2026-08-31-category-rules.sql` dans le SQL editor Supabase.
2. `npm run dev`, ouvrir Réglages → « Recalculer les clés d'engagement », vérifier le compte rendu.
3. Importer l'export 13 mois : les 996 lignes apparaissent, catégorisées, avec leurs badges.
4. Cocher « Devinettes seulement », « Tout sélectionner », choisir une catégorie, vérifier le message « N lignes classées en X, M règles créées ».
5. Valider l'import, puis ré-importer le même fichier : tout doit être marqué doublon et les catégories doivent venir des règles (badge « règle »).

---

## Notes d'exécution

- **Ordre contraignant** : Task 1 avant 4, 7 et 8 (tout dépend de `merchantKey`) ; Task 2 avant 4 (les champs `shortLabel`/`operationType`) ; Tasks 3 et 4 avant 6 ; Tasks 4 et 5 avant 7. La Task 8 en dernier, c'est la plus risquée.
- **Ne jamais lancer vitest avec `--update`** : `lib/simulator.test.ts` contient des snapshots de caractérisation d'un autre chantier, qui doivent rester intacts.
- Les migrations SQL ne sont **pas** exécutées par les agents. Tant que `2026-08-31-category-rules.sql` n'est pas passée, `useCategoryRules` échouera sur une table inconnue et retombera sur une Map vide — comportement voulu, l'app reste utilisable, la classification perd seulement son niveau 1.
- Le fichier d'export réel de l'utilisateur est disponible pour vérification à `C:/Users/jeffa/.claude/uploads/4fc127f8-f0a0-486a-a1b3-7c31157bc0d1/ef64c08e-E2438172.xls` (996 opérations, 07/08/2025 → 28/08/2026). Tout script de vérification doit être supprimé avant commit.
