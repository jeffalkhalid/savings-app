import { merchantKey } from "./payee-key";

export type RekeyInput = {
  id: string;
  payee_key: string;
  label: string;
  expected_amount: number;
  created_at: string;
};

export type RekeyPlan = {
  updates: { id: string; payeeKey: string }[];
  deletes: string[];
};

/**
 * Recalcule les clés des engagements existants avec `merchantKey`.
 *
 * Plusieurs anciennes clés peuvent converger vers une seule — c'est l'effet
 * recherché — mais la contrainte `unique (user_id, payee_key)` interdit deux
 * lignes de même clé : on garde la plus récente et on supprime les autres.
 */
export function planRekey(charges: RekeyInput[]): RekeyPlan {
  const byNewKey = new Map<string, RekeyInput[]>();
  for (const ch of charges) {
    const key = merchantKey(ch.label);
    if (!key) continue;
    const list = byNewKey.get(key) ?? [];
    list.push(ch);
    byNewKey.set(key, list);
  }

  const updates: { id: string; payeeKey: string }[] = [];
  const deletes: string[] = [];

  for (const [key, list] of byNewKey) {
    const sorted = [...list].sort((a, b) =>
      a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0
    );
    const keep = sorted[0];
    for (const ch of sorted.slice(1)) deletes.push(ch.id);
    if (keep.payee_key !== key) updates.push({ id: keep.id, payeeKey: key });
  }

  return { updates, deletes };
}
