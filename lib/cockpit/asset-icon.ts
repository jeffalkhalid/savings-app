import {
  TrendingUp,
  PiggyBank,
  Banknote,
  Coins,
  CreditCard,
  type LucideIcon,
} from "lucide-react";

function normalize(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const RULES: { kw: string; icon: LucideIcon }[] = [
  { kw: "stock", icon: TrendingUp },
  { kw: "action", icon: TrendingUp },
  { kw: "invest", icon: TrendingUp },
  { kw: "saving", icon: PiggyBank },
  { kw: "livret", icon: PiggyBank },
  { kw: "cash", icon: Banknote },
  { kw: "liquid", icon: Banknote },
  { kw: "commodity", icon: Coins },
];

export function assetIcon(type: string): LucideIcon {
  const n = normalize(type);
  for (const r of RULES) if (n.includes(r.kw)) return r.icon;
  return CreditCard;
}
