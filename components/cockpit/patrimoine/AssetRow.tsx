import { eur } from "@/lib/cockpit/format";
import { typeLabel } from "@/lib/cockpit/patrimoine";
import { assetIcon } from "@/lib/cockpit/asset-icon";
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
  const Icon = assetIcon(asset.type);
  const sub = [typeLabel(asset.type), accountName].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 py-2.5 border-b border-rule text-left"
    >
      <div className="w-9 h-9 rounded-xl bg-tile flex items-center justify-center shrink-0">
        <Icon size={18} className="text-ink2" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{asset.name}</div>
        <div className="text-[11px] text-ink-muted mt-0.5">{sub}</div>
      </div>
      <strong className="font-mono-num text-sm shrink-0">
        {eur(Number(asset.current_value))}
      </strong>
    </button>
  );
}
