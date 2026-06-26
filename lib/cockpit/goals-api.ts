import { supabase } from "./supabase";

export type GoalFields = {
  name: string;
  icon: string;
  targetAmount: number;
  deadline: string | null;
};

export async function createGoal(userId: string, f: GoalFields): Promise<void> {
  const { error } = await supabase.from("goals").insert({
    user_id: userId,
    name: f.name,
    icon: f.icon,
    target_amount: f.targetAmount,
    current_amount: 0,
    deadline: f.deadline,
  });
  if (error) throw new Error(error.message);
}

export async function updateGoal(id: string, f: GoalFields): Promise<void> {
  const { error } = await supabase
    .from("goals")
    .update({
      name: f.name,
      icon: f.icon,
      target_amount: f.targetAmount,
      deadline: f.deadline,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteGoal(id: string): Promise<void> {
  const { error } = await supabase.from("goals").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function contributeToGoal(
  id: string,
  newCurrent: number
): Promise<void> {
  const { error } = await supabase
    .from("goals")
    .update({ current_amount: newCurrent })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
