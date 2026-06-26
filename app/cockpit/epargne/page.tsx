"use client";

import { useMemo } from "react";
import { useAllTransactions } from "@/lib/cockpit/hooks";
import { averageMonthlyNet } from "@/lib/cockpit/projection";
import { SimulatorView } from "@/components/cockpit/projection/SimulatorView";

export default function EpargnePage() {
  const { txns } = useAllTransactions();
  const avgFlow = useMemo(() => averageMonthlyNet(txns), [txns]);

  return (
    <main className="max-w-[600px] mx-auto px-5 pt-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl">Stratégies d&apos;épargne</h1>
        <p className="text-[13px] text-ink-muted mt-1">PEG · PER — net de sortie</p>
      </header>
      <SimulatorView avgFlow={avgFlow} />
    </main>
  );
}
