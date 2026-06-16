import type { CategoryInsight } from "@/lib/cockpit/categories-analysis";
import { CategoryRow } from "./CategoryRow";

export function CategoryBreakdown({
  insights,
  monthLabel,
  onSelect,
}: {
  insights: CategoryInsight[];
  monthLabel: string;
  onSelect: (categoryId: string) => void;
}) {
  return (
    <section>
      <div className="text-xs uppercase tracking-[0.1em] text-ink-muted mb-2">
        Dépenses par poste · {monthLabel}
      </div>
      {!insights.length && (
        <p className="text-ink-muted text-sm py-4">Aucune dépense ce mois.</p>
      )}
      {insights.map((i) => (
        <CategoryRow
          key={i.categoryId}
          insight={i}
          onClick={() => onSelect(i.categoryId)}
        />
      ))}
    </section>
  );
}
