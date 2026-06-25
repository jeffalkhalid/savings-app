export type MoodTone = "good" | "ok" | "watch";
export type Mood = { label: string; progress: number; tone: MoodTone };

export function savingsMood(taux: number, goal: number): Mood {
  const progress = goal > 0 ? Math.max(0, Math.min(1, taux / goal)) : 0;
  if (taux >= goal) return { label: "Au top", progress, tone: "good" };
  if (taux >= goal / 2) return { label: "Bien", progress, tone: "ok" };
  return { label: "À surveiller", progress, tone: "watch" };
}
