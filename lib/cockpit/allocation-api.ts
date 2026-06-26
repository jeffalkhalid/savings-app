import { supabase } from "./supabase";

export async function getAllocationTargets(
  userId: string
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("allocation_targets")
    .select("asset_type,target_pct")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const m: Record<string, number> = {};
  for (const r of (data as { asset_type: string; target_pct: number }[]) ?? []) {
    m[r.asset_type] = Number(r.target_pct);
  }
  return m;
}

export async function saveAllocationTargets(
  userId: string,
  targets: Record<string, number>
): Promise<void> {
  const rows = Object.entries(targets).map(([asset_type, target_pct]) => ({
    user_id: userId,
    asset_type,
    target_pct,
  }));
  if (!rows.length) return;
  const { error } = await supabase
    .from("allocation_targets")
    .upsert(rows, { onConflict: "user_id,asset_type" });
  if (error) throw new Error(error.message);
}
