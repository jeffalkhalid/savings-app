import type { CategoryInsight } from "./categories-analysis";
import type { Mood } from "./mood";

export type Note = {
  kind: "status" | "rise" | "dominant";
  title: string;
  body: string;
  tone: Mood["tone"];
};

export function buildNotes(insights: CategoryInsight[], mood: Mood): Note[] {
  const notes: Note[] = [
    {
      kind: "status",
      title: mood.label,
      body: "Ton taux d'épargne ce mois",
      tone: mood.tone,
    },
  ];
  const seen = new Set<string>();

  const risers = insights.filter(
    (i) => i.deltaPct !== null && (i.deltaPct as number) > 0
  );
  if (risers.length) {
    const top = risers.reduce((a, b) =>
      (b.deltaPct as number) > (a.deltaPct as number) ? b : a
    );
    notes.push({
      kind: "rise",
      title: top.name,
      body: `+${Math.round((top.deltaPct as number) * 100)}% vs ton habitude`,
      tone: "watch",
    });
    seen.add(top.name);
  }

  if (insights.length) {
    const dom = insights.reduce((a, b) => (b.share > a.share ? b : a));
    if (!seen.has(dom.name)) {
      notes.push({
        kind: "dominant",
        title: dom.name,
        body: `${Math.round(dom.share * 100)}% de tes dépenses`,
        tone: "ok",
      });
    }
  }
  return notes.slice(0, 3);
}
