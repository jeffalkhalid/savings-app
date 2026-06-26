import { convert } from "./fx";

export type Asset = {
  id: string;
  account_id: string | null;
  name: string;
  type: string;
  current_value: number;
  ticker?: string | null;
  quantity?: number | null;
  currency?: string;
};

export type AssetValuation = {
  id: string;
  asset_id: string;
  date: string; // YYYY-MM-DD
  value: number;
};

export type PatrimoineLine = {
  type: string;
  n_assets: number;
  total_value: number;
};

// Most recent valuation by date; 0 if the list is empty.
export function latestValue(valuations: AssetValuation[]): number {
  if (!valuations.length) return 0;
  const latest = valuations.reduce((a, b) => (b.date > a.date ? b : a));
  return Number(latest.value);
}

// Net worth over time: for each date present in valuations (of known assets),
// sum over assets of the latest valuation on or before that date.
export function buildPatrimoineSeries(
  assets: Asset[],
  valuations: AssetValuation[]
): { date: string; total: number }[] {
  const known = new Set(assets.map((a) => a.id));
  const vals = valuations.filter((v) => known.has(v.asset_id));

  const byAsset = new Map<string, AssetValuation[]>();
  for (const v of vals) {
    const arr = byAsset.get(v.asset_id) ?? [];
    arr.push(v);
    byAsset.set(v.asset_id, arr);
  }

  const dates = [...new Set(vals.map((v) => v.date))].sort();
  return dates.map((date) => {
    let total = 0;
    for (const arr of byAsset.values()) {
      const upTo = arr.filter((v) => v.date <= date);
      total += latestValue(upTo);
    }
    return { date, total };
  });
}

export function withShares(
  lines: PatrimoineLine[]
): (PatrimoineLine & { share: number })[] {
  const total = lines.reduce((a, l) => a + Number(l.total_value), 0);
  return lines.map((l) => ({
    type: l.type,
    n_assets: Number(l.n_assets),
    total_value: Number(l.total_value),
    share: total > 0 ? Number(l.total_value) / total : 0,
  }));
}

const TYPE_LABELS: Record<string, string> = {
  stock: "Actions",
  savings: "Livrets",
  cash: "Liquidités",
  commodity: "Or",
};

export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

export function convertedLines(
  assets: Asset[],
  ratesEUR: Record<string, number>,
  reporting: string
): PatrimoineLine[] {
  const byType: Record<string, { n: number; total: number }> = {};
  for (const a of assets) {
    const v = convert(
      Number(a.current_value),
      a.currency ?? "EUR",
      reporting,
      ratesEUR
    );
    const slot = byType[a.type] ?? { n: 0, total: 0 };
    slot.n += 1;
    slot.total += v;
    byType[a.type] = slot;
  }
  return Object.entries(byType).map(([type, s]) => ({
    type,
    n_assets: s.n,
    total_value: s.total,
  }));
}
