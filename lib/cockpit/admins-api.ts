import { supabase } from "./supabase";

export type AdminRow = { user_id: string; email: string };

export async function listAdmins(): Promise<AdminRow[]> {
  const { data, error } = await supabase.rpc("list_admins");
  if (error) throw new Error(error.message);
  return (data as AdminRow[]) ?? [];
}

export async function addAdminByEmail(email: string): Promise<void> {
  const { error } = await supabase.rpc("add_admin_by_email", { p_email: email });
  if (error) throw new Error(error.message);
}

export async function removeAdmin(userId: string): Promise<void> {
  const { error } = await supabase.rpc("remove_admin", { p_user_id: userId });
  if (error) throw new Error(error.message);
}
