import { supabase } from "./supabase";

export type ReminderFields = {
  label: string;
  dueDate: string;
  amount: number | null;
};

export async function createReminder(
  userId: string,
  f: ReminderFields
): Promise<void> {
  const { error } = await supabase.from("reminders").insert({
    user_id: userId,
    label: f.label,
    due_date: f.dueDate,
    amount: f.amount,
    done: false,
  });
  if (error) throw new Error(error.message);
}

export async function updateReminder(
  id: string,
  f: ReminderFields
): Promise<void> {
  const { error } = await supabase
    .from("reminders")
    .update({ label: f.label, due_date: f.dueDate, amount: f.amount })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteReminder(id: string): Promise<void> {
  const { error } = await supabase.from("reminders").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setReminderDone(id: string, done: boolean): Promise<void> {
  const { error } = await supabase
    .from("reminders")
    .update({ done })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
