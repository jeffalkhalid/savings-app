import type { PatrimoineLine } from "./patrimoine";

export const ALLOCATION_TYPES: string[] = [
  "stock",
  "savings",
  "cash",
  "commodity",
];

export type AllocationRow = {
  type: string;
  realPct: number;
  targetPct: number | null;
  delta: number | null;
};

export function allocationRows(
  lines: PatrimoineLine[],
  targets: Record<string, number>
): AllocationRow[] {
  const total = lines.reduce((a, l) => a + Number(l.total_value), 0);
  const realByType: Record<string, number> = {};
  for (const l of lines) {
    realByType[l.type] = (realByType[l.type] ?? 0) + Number(l.total_value);
  }
  const types = new Set<string>([
    ...Object.keys(realByType),
    ...Object.keys(targets).filter((t) => targets[t] > 0),
  ]);
  const rows: AllocationRow[] = [...types].map((type) => {
    const realPct = total > 0 ? ((realByType[type] ?? 0) / total) * 100 : 0;
    const t = targets[type];
    const targetPct = t != null && t > 0 ? t : null;
    return {
      type,
      realPct,
      targetPct,
      delta: targetPct != null ? realPct - targetPct : null,
    };
  });
  return rows.sort(
    (a, b) => b.realPct - a.realPct || (b.targetPct ?? 0) - (a.targetPct ?? 0)
  );
}

export function targetsTotal(targets: Record<string, number>): number {
  return Object.values(targets).reduce(
    (a, v) => a + (Number(v) > 0 ? Number(v) : 0),
    0
  );
}
