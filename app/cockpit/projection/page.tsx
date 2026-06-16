"use client";

import { useMemo, useState } from "react";
import {
  useAuth,
  useAllTransactions,
  usePatrimoineSummary,
} from "@/lib/cockpit/hooks";
import { averageMonthlyNet } from "@/lib/cockpit/projection";
import { ProjectionTabs } from "@/components/cockpit/projection/ProjectionTabs";
import { ProjectionView } from "@/components/cockpit/projection/ProjectionView";
import { SimulatorView } from "@/components/cockpit/projection/SimulatorView";

export default function ProjectionPage() {
  const user = useAuth();
  const { txns, error: txnError } = useAllTransactions();
  const { lines } = usePatrimoineSummary(user.id);

  const avgFlow = useMemo(() => averageMonthlyNet(txns), [txns]);
  const initial = lines.reduce((a, l) => a + Number(l.total_value), 0);

  const [tab, setTab] = useState<"projection" | "simulateur">("projection");

  return (
    <main className="max-w-[600px] mx-auto px-5 pt-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl">Projection</h1>
      </header>

      <ProjectionTabs active={tab} onSelect={setTab} />

      {tab === "projection" ? (
        <ProjectionView avgFlow={avgFlow} initial={initial} txnError={txnError} />
      ) : (
        <SimulatorView avgFlow={avgFlow} />
      )}
    </main>
  );
}
