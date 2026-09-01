"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import {
  useAuth,
  useCategories,
  useAccounts,
  useRecurringCharges,
  useCategoryRules,
  useAllTransactions,
} from "@/lib/cockpit/hooks";
import { supabase } from "@/lib/cockpit/supabase";
import {
  parseBnpSheet,
  rowKey,
} from "@/lib/cockpit/bnp-import";
import {
  createTransactionsBulk,
  type ImportRow,
} from "@/lib/cockpit/transactions-api";
import {
  classifyRows,
  buildHistoryMap,
  FALLBACK_CATEGORY,
  type ClassifiedRow,
} from "@/lib/cockpit/classify";
import {
  applyCategoryToSelection,
  rulesFromSelection,
  bulkSummary,
} from "@/lib/cockpit/bulk-select";
import { setCategoryRule, setCategoryRules } from "@/lib/cockpit/category-rules-api";
import { createRecurringCharge } from "@/lib/cockpit/recurring-charges-api";
import { merchantKey } from "@/lib/cockpit/payee-key";
import { ensureTransferCategories } from "@/lib/cockpit/transfers-api";
import type { Category } from "@/lib/cockpit/types";
import { ImportDropzone } from "@/components/cockpit/import/ImportDropzone";
import { ReviewTable } from "@/components/cockpit/import/ReviewTable";
import { CategoryPickerSheet } from "@/components/cockpit/CategoryPickerSheet";

type Row = ClassifiedRow & {
  duplicate: boolean;
  include: boolean;
  engagement?: boolean;
};

export default function ImportPage() {
  const user = useAuth();
  const router = useRouter();
  const { categories: liveCategories } = useCategories();
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    if (!liveCategories.length) return;
    ensureTransferCategories(user.id, liveCategories)
      .then(setCategories)
      .catch(() => setCategories(liveCategories));
  }, [liveCategories, user.id]);
  const { accounts } = useAccounts();
  const { charges } = useRecurringCharges();
  const { rules, loaded: rulesLoaded, refetch: refetchRules } = useCategoryRules(user.id);
  const { txns: allTxns, loading: txnsLoading } = useAllTransactions();
  const engagementKeys = useMemo(
    () => new Set(charges.map((c) => c.payee_key)),
    [charges]
  );
  const [rows, setRows] = useState<Row[] | null>(null);
  const [accountId, setAccountId] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [guessOnly, setGuessOnly] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pickerFor, setPickerFor] = useState<number | "bulk" | null>(null);
  const [notice, setNotice] = useState("");

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
          rowKey(
            String((d as { date: string }).date),
            Number((d as { amount: number }).amount)
          )
        )
      );
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
      setAccountId(
        accounts.find((a) => a.name.includes("BNP"))?.id ?? accounts[0]?.id ?? ""
      );
    } catch {
      setError("Lecture du fichier impossible.");
    }
  };

  const setInclude = (i: number, v: boolean) =>
    setRows((rs) =>
      rs ? rs.map((r, idx) => (idx === i ? { ...r, include: v } : r)) : rs
    );
  const setEngagement = (i: number, v: boolean) =>
    setRows((rs) =>
      rs ? rs.map((r, idx) => (idx === i ? { ...r, engagement: v } : r)) : rs
    );

  const toggleSelected = (i: number, v: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (v) next.add(i);
      else next.delete(i);
      return next;
    });

  /** Le seul filtre de la revue : centralisé pour que sélection et "tout sélectionner" restent d'accord. */
  const matchesFilter = (r: Row, guessOnlyValue: boolean) =>
    guessOnlyValue ? r.provenance === "guess" : true;

  const selectAllVisible = () =>
    setSelected(
      new Set(
        (rows ?? [])
          .map((r, i) => ({ r, i }))
          .filter(({ r }) => matchesFilter(r, guessOnly))
          .map(({ i }) => i)
      )
    );

  /**
   * Change le filtre et purge la sélection des lignes qui deviennent invisibles :
   * sans ça, "sélectionnées" pourrait désigner des lignes que l'utilisateur ne voit plus,
   * et « Catégoriser » agirait sur des lignes hors écran sans avertissement.
   */
  const setGuessOnlyFiltered = (v: boolean) => {
    setGuessOnly(v);
    setSelected((s) => {
      if (!rows) return s;
      const next = new Set<number>();
      for (const i of s) {
        if (matchesFilter(rows[i], v)) next.add(i);
      }
      return next;
    });
  };

  const pickCategory = async (name: string) => {
    if (!rows || pickerFor === null) return;
    const cat = categories.find((c) => c.name === name);
    if (pickerFor === "bulk") {
      const next = applyCategoryToSelection(rows, selected, name).map((r, i) =>
        selected.has(i) ? { ...r, provenance: "rule" as const } : r
      );
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
        rs
          ? rs.map((r, idx) =>
              key
                ? r.payeeKey === key
                  ? { ...r, categoryName: name, provenance: "rule" as const }
                  : r
                : idx === i
                  ? { ...r, categoryName: name, provenance: "rule" as const }
                  : r
            )
          : rs
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

  const doImport = async () => {
    if (!rows) return;
    setError("");
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
    if (!importRows.length) {
      if (unresolved.length) {
        setError(
          `${unresolved.length} ligne(s) ignorée(s) : catégorie introuvable et « ${FALLBACK_CATEGORY} » absente de vos catégories.`
        );
      }
      return;
    }
    setImporting(true);
    try {
      await createTransactionsBulk(user.id, importRows);
      const seen = new Set<string>();
      for (const r of rows.filter((x) => x.include && x.engagement && x.amount < 0)) {
        const payee = r.label || r.categoryName;
        const key = merchantKey(payee);
        if (!key || engagementKeys.has(key) || seen.has(key)) continue;
        seen.add(key);
        await createRecurringCharge(user.id, {
          payeeKey: key,
          label: payee,
          expectedAmount: Math.abs(r.amount),
        });
      }
      refetchRules();
      if (unresolved.length) {
        setRows(null);
        setImporting(false);
        setError(
          `Import terminé. ${unresolved.length} ligne(s) ignorée(s) : catégorie introuvable et « ${FALLBACK_CATEGORY} » absente de vos catégories. Ajoutez la catégorie « ${FALLBACK_CATEGORY} » puis réimportez ces lignes.`
        );
        return;
      }
      router.push("/cockpit");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setImporting(false);
    }
  };

  // Calculé une seule fois et partagé entre la table et la feuille de choix,
  // pour que les deux ne puissent jamais lister des catégories archivées différemment.
  const activeCategories = categories.filter((c) => c.active !== false);

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

      {!rows &&
        (categories.length && accounts.length && rulesLoaded && !txnsLoading ? (
          <ImportDropzone onFile={handleFile} />
        ) : (
          <p className="text-ink-muted text-sm">Chargement des catégories…</p>
        ))}
      {error && <p className="text-strat-a text-sm mt-4">{error}</p>}
      {notice && <p className="text-[13px] text-emerald mb-3">{notice}</p>}

      {rows && (
        <ReviewTable
          rows={rows}
          categories={activeCategories}
          accounts={accounts}
          accountId={accountId}
          onAccount={setAccountId}
          onToggleInclude={setInclude}
          onImport={doImport}
          importing={importing}
          engagementKeys={engagementKeys}
          onToggleEngagement={setEngagement}
          guessOnly={guessOnly}
          onGuessOnly={setGuessOnlyFiltered}
          selected={selected}
          onToggleSelected={toggleSelected}
          onSelectAllVisible={selectAllVisible}
          onClearSelection={() => setSelected(new Set())}
          onOpenPicker={(i) => setPickerFor(i)}
          onBulkPick={() => setPickerFor("bulk")}
        />
      )}

      {pickerFor !== null && (
        <CategoryPickerSheet
          categories={activeCategories}
          title={
            pickerFor === "bulk"
              ? `Catégoriser ${selected.size} ligne${selected.size > 1 ? "s" : ""}`
              : "Choisir la catégorie"
          }
          onPick={pickCategory}
          onClose={() => setPickerFor(null)}
        />
      )}
    </main>
  );
}
