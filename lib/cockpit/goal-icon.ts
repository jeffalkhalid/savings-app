import {
  Target,
  Home,
  Car,
  Plane,
  GraduationCap,
  Gift,
  Heart,
  PiggyBank,
  Shield,
  Umbrella,
  Baby,
  Smartphone,
  type LucideIcon,
} from "lucide-react";

export const GOAL_ICONS: string[] = [
  "target",
  "home",
  "car",
  "plane",
  "graduation",
  "gift",
  "heart",
  "piggy",
  "shield",
  "umbrella",
  "baby",
  "phone",
];

const MAP: Record<string, LucideIcon> = {
  target: Target,
  home: Home,
  car: Car,
  plane: Plane,
  graduation: GraduationCap,
  gift: Gift,
  heart: Heart,
  piggy: PiggyBank,
  shield: Shield,
  umbrella: Umbrella,
  baby: Baby,
  phone: Smartphone,
};

export function goalIcon(key: string): LucideIcon {
  return MAP[key] ?? Target;
}
