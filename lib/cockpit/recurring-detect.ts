import type { Txn } from "./types";

export function normalizePayee(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type RecurringCandidate = {
  payeeKey: string;
  label: string;
  expected: number;
  monthsSeen: number;
};

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (!n) return 0;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

function windowMonths(monthISO: string, n: number): Set<string> {
  const [y, m] = monthISO.split("-").map(Number);
  const set = new Set<string>();
  for (let i = 0; i < n; i++) {
    const total = y * 12 + (m - 1) - i;
    const yy = Math.floor(total / 12);
    const mm = (total % 12) + 1;
    set.add(`${yy}-${String(mm).padStart(2, "0")}`);
  }
  return set;
}

export function detectRecurring(
  allTxns: Txn[],
  monthISO: string
): RecurringCandidate[] {
  const months = windowMonths(monthISO, 6);
  const groups = new Map<
    string,
    { byMonth: Map<string, number>; labels: Map<string, number> }
  >();
  for (const t of allTxns) {
    if (t.type !== "expense") continue;
    const ym = t.date.slice(0, 7);
    if (!months.has(ym)) continue;
    const key = normalizePayee(t.description);
    if (!key) continue;
    const g = groups.get(key) ?? { byMonth: new Map(), labels: new Map() };
    g.byMonth.set(ym, (g.byMonth.get(ym) ?? 0) + Math.abs(Number(t.amount)));
    g.labels.set(t.description, (g.labels.get(t.description) ?? 0) + 1);
    groups.set(key, g);
  }
  const out: RecurringCandidate[] = [];
  for (const [payeeKey, g] of groups) {
    const monthsSeen = g.byMonth.size;
    if (monthsSeen < 3) continue;
    const expected = median([...g.byMonth.values()]);
    let label = payeeKey;
    let best = -1;
    for (const [lbl, n] of g.labels) {
      if (n > best) {
        best = n;
        label = lbl;
      }
    }
    out.push({ payeeKey, label, expected, monthsSeen });
  }
  return out.sort((a, b) => b.expected - a.expected);
}
