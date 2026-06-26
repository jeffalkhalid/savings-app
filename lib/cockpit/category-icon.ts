import {
  Briefcase,
  Home,
  ShoppingCart,
  UtensilsCrossed,
  Car,
  Zap,
  Smartphone,
  Shield,
  HeartPulse,
  Clapperboard,
  Shirt,
  Landmark,
  ArrowLeftRight,
  PiggyBank,
  TrendingUp,
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
  { kw: "salaire", icon: Briefcase },
  { kw: "logement", icon: Home },
  { kw: "course", icon: ShoppingCart },
  { kw: "restaurant", icon: UtensilsCrossed },
  { kw: "transport", icon: Car },
  { kw: "energie", icon: Zap },
  { kw: "telephon", icon: Smartphone },
  { kw: "internet", icon: Smartphone },
  { kw: "assurance", icon: Shield },
  { kw: "sante", icon: HeartPulse },
  { kw: "loisir", icon: Clapperboard },
  { kw: "vetement", icon: Shirt },
  { kw: "banc", icon: Landmark },
  { kw: "virement", icon: ArrowLeftRight },
  { kw: "epargne", icon: PiggyBank },
  { kw: "invest", icon: TrendingUp },
  { kw: "bourse", icon: TrendingUp },
  { kw: "natixis", icon: TrendingUp },
];

export function categoryIcon(name: string): LucideIcon {
  const n = normalize(name);
  for (const r of RULES) if (n.includes(r.kw)) return r.icon;
  return CreditCard;
}
