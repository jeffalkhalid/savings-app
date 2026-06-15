import { supabase } from "./supabase";
import { latestValue } from "./patrimoine";
import type { AssetValuation } from "./patrimoine";

// Recompute an asset's current_value from its remaining valuations.
async function syncCurrentValue(assetId: string): Promise<void> {
  const { data, error } = await supabase
    .from("asset_valuations")
    .select("id,asset_id,date,value")
    .eq("asset_id", assetId);
  if (error) throw new Error(error.message);
  const cv = latestValue((data as AssetValuation[]) ?? []);
  const { error: uErr } = await supabase
    .from("assets")
    .update({ current_value: cv })
    .eq("id", assetId);
  if (uErr) throw new Error(uErr.message);
}

export async function createAsset(input: {
  userId: string;
  name: string;
  type: string;
  accountId: string | null;
  ticker: string | null;
  quantity: number | null;
  initialValue: number;
  date: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from("assets")
    .insert({
      user_id: input.userId,
      account_id: input.accountId,
      name: input.name,
      type: input.type,
      current_value: input.initialValue,
      ticker: input.ticker,
      quantity: input.quantity,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const assetId = (data as { id: string }).id;
  const { error: vErr } = await supabase.from("asset_valuations").insert({
    user_id: input.userId,
    asset_id: assetId,
    date: input.date,
    value: input.initialValue,
  });
  if (vErr) throw new Error(vErr.message);
  return assetId;
}

export async function updateAsset(input: {
  id: string;
  name: string;
  type: string;
  accountId: string | null;
  ticker: string | null;
  quantity: number | null;
}): Promise<void> {
  const { error } = await supabase
    .from("assets")
    .update({
      name: input.name,
      type: input.type,
      account_id: input.accountId,
      ticker: input.ticker,
      quantity: input.quantity,
    })
    .eq("id", input.id);
  if (error) throw new Error(error.message);
}

export async function deleteAsset(assetId: string): Promise<void> {
  // Delete valuations first (no reliance on ON DELETE CASCADE).
  const { error: vErr } = await supabase
    .from("asset_valuations")
    .delete()
    .eq("asset_id", assetId);
  if (vErr) throw new Error(vErr.message);
  const { error } = await supabase.from("assets").delete().eq("id", assetId);
  if (error) throw new Error(error.message);
}

export async function addValuation(input: {
  userId: string;
  assetId: string;
  date: string;
  value: number;
}): Promise<void> {
  const { error } = await supabase.from("asset_valuations").insert({
    user_id: input.userId,
    asset_id: input.assetId,
    date: input.date,
    value: input.value,
  });
  if (error) throw new Error(error.message);
  await syncCurrentValue(input.assetId);
}

export async function updateValuation(input: {
  id: string;
  assetId: string;
  date: string;
  value: number;
}): Promise<void> {
  const { error } = await supabase
    .from("asset_valuations")
    .update({ date: input.date, value: input.value })
    .eq("id", input.id);
  if (error) throw new Error(error.message);
  await syncCurrentValue(input.assetId);
}

export async function deleteValuation(input: {
  id: string;
  assetId: string;
}): Promise<void> {
  const { error } = await supabase
    .from("asset_valuations")
    .delete()
    .eq("id", input.id);
  if (error) throw new Error(error.message);
  await syncCurrentValue(input.assetId);
}
