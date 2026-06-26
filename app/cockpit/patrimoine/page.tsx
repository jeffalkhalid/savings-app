"use client";

import { useMemo, useState } from "react";
import {
  useAuth,
  useAccounts,
  useAssets,
  useAssetValuations,
  usePatrimoineSummary,
  useAllocationTargets,
} from "@/lib/cockpit/hooks";
import { buildPatrimoineSeries } from "@/lib/cockpit/patrimoine";
import type { Asset } from "@/lib/cockpit/patrimoine";
import { allocationRows } from "@/lib/cockpit/allocation";
import { AllocationTargets } from "@/components/cockpit/patrimoine/AllocationTargets";
import { AllocationModal } from "@/components/cockpit/patrimoine/AllocationModal";
import { PatrimoineHero } from "@/components/cockpit/patrimoine/PatrimoineHero";
import { PatrimoineChart } from "@/components/cockpit/patrimoine/PatrimoineChart";
import { TypeBreakdown } from "@/components/cockpit/patrimoine/TypeBreakdown";
import { AssetList } from "@/components/cockpit/patrimoine/AssetList";
import { AssetModal } from "@/components/cockpit/patrimoine/AssetModal";
import { ValuationModal } from "@/components/cockpit/patrimoine/ValuationModal";

export default function PatrimoinePage() {
  const user = useAuth();
  const { assets, loading: aLoading, error: aError, refetch: refetchAssets } =
    useAssets();
  const { valuations, refetch: refetchVals } = useAssetValuations();
  const { lines, refetch: refetchSummary } = usePatrimoineSummary(user.id);
  const { targets, refetch: refetchTargets } = useAllocationTargets(user.id);
  const { accounts } = useAccounts();

  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [showAlloc, setShowAlloc] = useState(false);

  const series = useMemo(
    () => buildPatrimoineSeries(assets, valuations),
    [assets, valuations]
  );
  // Total = somme des current_value (via v_patrimoine). Invariant : current_value
  // est tenu synchro à la dernière valuation par syncCurrentValue, donc ce total
  // coïncide avec le dernier point de `series`. Deux sources, un seul réel.
  const total = lines.reduce((a, l) => a + Number(l.total_value), 0);
  const delta =
    series.length >= 2
      ? series[series.length - 1].total - series[series.length - 2].total
      : null;

  const allocRows = useMemo(
    () => allocationRows(lines, targets),
    [lines, targets]
  );

  const refetchAll = () => {
    refetchAssets();
    refetchVals();
    refetchSummary();
  };

  const selectedValuations = selected
    ? valuations.filter((v) => v.asset_id === selected.id)
    : [];

  return (
    <main className="max-w-[600px] mx-auto px-5 pt-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl">Patrimoine</h1>
      </header>

      <PatrimoineHero total={total} delta={delta} count={assets.length} />
      <PatrimoineChart series={series} />
      <TypeBreakdown lines={lines} />
      <AllocationTargets
        rows={allocRows}
        targets={targets}
        onEdit={() => setShowAlloc(true)}
      />
      <AssetList
        assets={assets}
        accounts={accounts}
        loading={aLoading}
        error={aError}
        onSelect={setSelected}
        onAdd={() => setShowCreate(true)}
      />

      {showCreate && (
        <AssetModal
          userId={user.id}
          accounts={accounts}
          asset={null}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            refetchAll();
            setShowCreate(false);
          }}
        />
      )}

      {editAsset && (
        <AssetModal
          userId={user.id}
          accounts={accounts}
          asset={editAsset}
          onClose={() => setEditAsset(null)}
          onSaved={() => {
            refetchAll();
            setEditAsset(null);
          }}
        />
      )}

      {selected && (
        <ValuationModal
          userId={user.id}
          asset={selected}
          valuations={selectedValuations}
          onClose={() => setSelected(null)}
          onChanged={refetchAll}
          onEditAsset={() => {
            setEditAsset(selected);
            setSelected(null);
          }}
        />
      )}

      {showAlloc && (
        <AllocationModal
          userId={user.id}
          targets={targets}
          onClose={() => setShowAlloc(false)}
          onSaved={() => {
            refetchTargets();
            setShowAlloc(false);
          }}
        />
      )}
    </main>
  );
}
