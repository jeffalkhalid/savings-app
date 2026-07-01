"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { useAuth, useCategories, useAccounts, useRecurringCharges } from "@/lib/cockpit/hooks";
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
import {
  classifyTransfer,
  targetCategoryName,
} from "@/lib/cockpit/classify-transfer";
import { createRecurringCharge } from "@/lib/cockpit/recurring-charges-api";
import { normalizePayee } from "@/lib/cockpit/recurring-detect";
import { ensureTransferCategories } from "@/lib/cockpit/transfers-api";
import type { Category } from "@/lib/cockpit/types";
import { ImportDropzone } from "@/components/cockpit/import/ImportDropzone";
import { ReviewTable } from "@/components/cockpit/import/ReviewTable";

type Row = ReviewRowData & { include: boolean; engagement?: boolean };

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
  const engagementKeys = useMemo(
    () => new Set(charges.map((c) => c.payee_key)),
    [charges]
  );
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
          rowKey(
            String((d as { date: string }).date),
            Number((d as { amount: number }).amount)
          )
        )
      );
      const reviewed = markDuplicates(parsed, existing).map((r) =>
        r.categoryName === "Virements"
          ? {
              ...r,
              categoryName: targetCategoryName(
                classifyTransfer(r.amount, r.label),
                r.label
              ),
            }
          : r
      );
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
  const setEngagement = (i: number, v: boolean) =>
    setRows((rs) =>
      rs ? rs.map((r, idx) => (idx === i ? { ...r, engagement: v } : r)) : rs
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
      const seen = new Set<string>();
      for (const r of rows.filter((x) => x.include && x.engagement && x.amount < 0)) {
        const payee = r.label || r.categoryName;
        const key = normalizePayee(payee);
        if (!key || engagementKeys.has(key) || seen.has(key)) continue;
        seen.add(key);
        await createRecurringCharge(user.id, {
          payeeKey: key,
          label: payee,
          expectedAmount: Math.abs(r.amount),
        });
      }
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

      {!rows &&
        (categories.length && accounts.length ? (
          <ImportDropzone onFile={handleFile} />
        ) : (
          <p className="text-ink-muted text-sm">Chargement des catégories…</p>
        ))}
      {error && <p className="text-strat-a text-sm mt-4">{error}</p>}

      {rows && (
        <ReviewTable
          rows={rows}
          categories={categories.filter((c) => c.active !== false)}
          accounts={accounts}
          accountId={accountId}
          onAccount={setAccountId}
          onCategory={setCategory}
          onToggleInclude={setInclude}
          onImport={doImport}
          importing={importing}
          engagementKeys={engagementKeys}
          onToggleEngagement={setEngagement}
        />
      )}
    </main>
  );
}
