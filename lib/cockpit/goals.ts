export type Goal = {
  id: string;
  name: string;
  icon: string;
  target_amount: number;
  current_amount: number;
  deadline?: string | null; // YYYY-MM-DD
  created_at?: string;
};

export function goalProgress(goal: Goal): {
  pct: number;
  remaining: number;
  done: boolean;
} {
  const target = Number(goal.target_amount);
  const current = Number(goal.current_amount);
  const pct = target > 0 ? Math.max(0, Math.min(1, current / target)) : 0;
  const remaining = Math.max(0, target - current);
  return { pct, remaining, done: target > 0 && current >= target };
}

export function monthsLeft(
  deadline: string | null | undefined,
  todayISO: string
): number | null {
  if (!deadline || deadline <= todayISO) return null;
  const [dy, dm, dd] = deadline.split("-").map(Number);
  const [ty, tm, td] = todayISO.split("-").map(Number);
  let months = (dy - ty) * 12 + (dm - tm);
  if (dd < td) months -= 1;
  return Math.max(1, months);
}

export function suggestedMonthly(goal: Goal, todayISO: string): number | null {
  const { remaining, done } = goalProgress(goal);
  if (done) return null;
  const m = monthsLeft(goal.deadline, todayISO);
  if (!m) return null;
  return remaining / m;
}

export function goalsSummary(goals: Goal[]): {
  totalCurrent: number;
  totalTarget: number;
  pct: number;
} {
  const totalCurrent = goals.reduce((a, g) => a + Number(g.current_amount), 0);
  const totalTarget = goals.reduce((a, g) => a + Number(g.target_amount), 0);
  const pct =
    totalTarget > 0 ? Math.max(0, Math.min(1, totalCurrent / totalTarget)) : 0;
  return { totalCurrent, totalTarget, pct };
}

export function applyContributions(
  goals: Goal[],
  contribByGoal: Record<string, number>
): Goal[] {
  return goals.map((g) => ({
    ...g,
    current_amount: Number(g.current_amount) + (contribByGoal[g.id] ?? 0),
  }));
}
