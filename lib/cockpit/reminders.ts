export type Reminder = {
  id: string;
  label: string;
  due_date: string; // YYYY-MM-DD
  amount?: number | null;
  done: boolean;
  created_at?: string;
};

export type ReminderStatus = "overdue" | "today" | "upcoming" | "done";

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000
  );
}

export function isDue(r: Reminder, todayISO: string): boolean {
  return !r.done && r.due_date <= todayISO;
}

export function dueCount(reminders: Reminder[], todayISO: string): number {
  return reminders.filter((r) => isDue(r, todayISO)).length;
}

export function activeReminders(reminders: Reminder[]): Reminder[] {
  return reminders
    .filter((r) => !r.done)
    .sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0));
}

export function reminderStatus(r: Reminder, todayISO: string): ReminderStatus {
  if (r.done) return "done";
  const d = daysBetween(todayISO, r.due_date);
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  return "upcoming";
}

export function dueLabel(dueDate: string, todayISO: string): string {
  const d = daysBetween(todayISO, dueDate);
  if (d < 0) return "en retard";
  if (d === 0) return "aujourd'hui";
  return `dans ${d} j`;
}
