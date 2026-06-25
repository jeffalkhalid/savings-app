function normalize(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const RULES: { kw: string; icon: string }[] = [
  { kw: "salaire", icon: "💼" },
  { kw: "logement", icon: "🏠" },
  { kw: "course", icon: "🛒" },
  { kw: "restaurant", icon: "🍽️" },
  { kw: "transport", icon: "🚗" },
  { kw: "energie", icon: "⚡" },
  { kw: "telephon", icon: "📱" },
  { kw: "internet", icon: "📱" },
  { kw: "assurance", icon: "🛡️" },
  { kw: "sante", icon: "⚕️" },
  { kw: "loisir", icon: "🎬" },
  { kw: "vetement", icon: "👕" },
  { kw: "banc", icon: "🏦" },
  { kw: "virement", icon: "🔄" },
  { kw: "epargne", icon: "🐷" },
  { kw: "invest", icon: "📈" },
  { kw: "bourse", icon: "📈" },
  { kw: "natixis", icon: "📈" },
];

export function categoryIcon(name: string): string {
  const n = normalize(name);
  for (const r of RULES) if (n.includes(r.kw)) return r.icon;
  return "💳";
}
