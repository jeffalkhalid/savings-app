import type { Asset } from "@/lib/cockpit/patrimoine";
import type { Account } from "@/lib/cockpit/types";
import { AssetRow } from "./AssetRow";

export function AssetList({
  assets,
  accounts,
  loading,
  error,
  onSelect,
}: {
  assets: Asset[];
  accounts: Account[];
  loading: boolean;
  error: string | null;
  onSelect: (a: Asset) => void;
}) {
  const nameOf = (id: string | null) =>
    accounts.find((c) => c.id === id)?.name;

  return (
    <section>
      <div className="text-xs uppercase tracking-[0.1em] text-ink-muted mb-2">
        Lignes · {assets.length}
      </div>
      {error && <p className="text-strat-a text-sm py-4">{error}</p>}
      {loading && !assets.length && (
        <p className="text-ink-muted text-sm py-4">Chargement…</p>
      )}
      {!loading && !error && !assets.length && (
        <p className="text-ink-muted text-sm py-4">
          Aucun asset — ajoute ta première ligne.
        </p>
      )}
      {assets.map((a) => (
        <AssetRow
          key={a.id}
          asset={a}
          accountName={nameOf(a.account_id)}
          onClick={() => onSelect(a)}
        />
      ))}
    </section>
  );
}
