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
