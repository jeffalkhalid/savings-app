"use client";

import { useMemo } from "react";
import { useAuth, useAllTransactions, usePatrimoineSummary } from "@/lib/cockpit/hooks";
import { averageMonthlyNet } from "@/lib/cockpit/projection";
import { ProjectionView } from "@/components/cockpit/projection/ProjectionView";

export default function ProjectionPage() {
  const user = useAuth();
  const { txns, error: txnError } = useAllTransactions();
  const { lines } = usePatrimoineSummary(user.id);

  const avgFlow = useMemo(() => averageMonthlyNet(txns), [txns]);
  const initial = lines.reduce((a, l) => a + Number(l.total_value), 0);

  return (
    <main className="max-w-[600px] mx-auto px-5 pt-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl">Projection</h1>
      </header>
      <ProjectionView avgFlow={avgFlow} initial={initial} txnError={txnError} />
    </main>
  );
}
