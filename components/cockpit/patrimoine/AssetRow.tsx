import { eur } from "@/lib/cockpit/format";
import { typeLabel } from "@/lib/cockpit/patrimoine";
import type { Asset } from "@/lib/cockpit/patrimoine";

export function AssetRow({
  asset,
  accountName,
  onClick,
}: {
  asset: Asset;
  accountName?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex justify-between items-center py-3 border-b border-rule text-left"
    >
      <div>
        <div className="text-sm">{asset.name}</div>
        <div className="text-[11px] text-ink-muted mt-0.5">
          {typeLabel(asset.type)}
          {accountName ? ` · ${accountName}` : ""}
        </div>
      </div>
      <strong className="font-mono-num text-sm">
        {eur(Number(asset.current_value))}
      </strong>
    </button>
  );
}
