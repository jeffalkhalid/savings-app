import type { Txn } from "./types";
import { merchantKey } from "./payee-key";

/**
 * Dérive des abonnements : quels commerçants récurrents coûtent chaque mois un
 * peu plus cher, et combien cela fait sur un an.
 *
 * Le module ne connaît ni React ni Supabase : il prend des transactions et une
 * date, et rend un classement.
 */
export type DriftPoint = { month: string; total: number };

export type Drift = {
  /** Clé commerçant, stable à travers les variantes de libellé. */
  key: string;
  /** Libellé d'affichage : le plus fréquent du groupe. */
  label: string;
  monthsSeen: number;
  /** Pente de la droite ajustée, en euros par mois. */
  slope: number;
  /** Qualité de l'ajustement, 0..1. */
  r2: number;
  /** slope × 12 : ce que la dérive coûte sur un an. */
  annualImpact: number;
  /** Médiane des 3 derniers mois observés — un montant qui s'est produit. */
  recent: number;
  series: DriftPoint[];
};

/** En dessous, une droite passe par n'importe quoi. */
export const MIN_MONTHS = 5;
/**
 * La droite doit décrire les points, pas seulement les traverser. C'est ce
 * seuil qui écarte les postes variables : leur pente est grande, leur
 * ajustement proche de zéro.
 */
export const MIN_R2 = 0.5;
/** En dessous, la ligne n'appelle aucune action. */
export const MIN_ANNUAL = 20;

/** Rang absolu d'un mois « YYYY-MM », pour mesurer les écarts en mois réels. */
function monthIndex(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return y * 12 + (m - 1);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (!n) return 0;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

/**
 * Droite des moindres carrés. Rendue totale à dessein : les appelants d'ici
 * garantissent au moins deux x distincts, mais une fonction qui rend NaN sur
 * une entrée dégénérée contaminerait silencieusement tout ce qui la consomme.
 */
function fit(points: { x: number; y: number }[]): { slope: number; r2: number } {
  const n = points.length;
  if (!n) return { slope: 0, r2: 0 };
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    sxx += (p.x - mx) * (p.x - mx);
    sxy += (p.x - mx) * (p.y - my);
    syy += (p.y - my) * (p.y - my);
  }
  if (sxx === 0) return { slope: 0, r2: 0 };
  // Variance nulle en y : la série est plate. Le R² est indéfini au sens
  // strict ; 0 est le choix qui ne ment pas, et une pente nulle est de toute
  // façon écartée par le seuil d'impact.
  return { slope: sxy / sxx, r2: syy === 0 ? 0 : (sxy * sxy) / (sxx * syy) };
}

export function merchantDrifts(txns: Txn[], today: string): Drift[] {
  const current = today.slice(0, 7);
  const groups = new Map<
    string,
    { byMonth: Map<string, number>; labels: Map<string, number> }
  >();

  for (const t of txns) {
    if (t.type !== "expense") continue;
    const month = t.date.slice(0, 7);
    // Le mois en cours est partiel : un abonnement pas encore prélevé y vaut
    // zéro et fabriquerait une chute. Les mois postérieurs, s'il en existe,
    // ne sont pas de l'historique observé et tombent par la même règle.
    if (month >= current) continue;
    const key = merchantKey(t.description);
    if (!key) continue;
    const g = groups.get(key) ?? {
      byMonth: new Map<string, number>(),
      labels: new Map<string, number>(),
    };
    g.byMonth.set(month, (g.byMonth.get(month) ?? 0) + Math.abs(Number(t.amount)));
    g.labels.set(t.description, (g.labels.get(t.description) ?? 0) + 1);
    groups.set(key, g);
  }

  const out: Drift[] = [];
  for (const [key, g] of groups) {
    const series = [...g.byMonth.entries()]
      .map(([month, total]) => ({ month, total }))
      .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
    if (series.length < MIN_MONTHS) continue;

    const base = monthIndex(series[0].month);
    const { slope, r2 } = fit(
      series.map((p) => ({ x: monthIndex(p.month) - base, y: p.total }))
    );
    const annualImpact = slope * 12;
    // Seules les hausses, et seulement celles qui valent une action.
    if (annualImpact < MIN_ANNUAL) continue;
    if (r2 <= MIN_R2) continue;

    let label = key;
    let best = -1;
    for (const [lbl, n] of g.labels) {
      if (n > best) {
        best = n;
        label = lbl;
      }
    }

    out.push({
      key,
      label,
      monthsSeen: series.length,
      slope,
      r2,
      annualImpact,
      recent: median(series.slice(-3).map((p) => p.total)),
      series,
    });
  }

  return out.sort((a, b) => b.annualImpact - a.annualImpact);
}
