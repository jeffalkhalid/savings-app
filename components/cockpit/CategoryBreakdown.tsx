import type { CategoryInsight } from "@/lib/cockpit/categories-analysis";
import { categoryIcon } from "@/lib/cockpit/category-icon";
import { CategoryRow } from "./CategoryRow";

export function CategoryBreakdown({
  insights,
  onSelect,
}: {
  insights: CategoryInsight[];
  onSelect: (categoryId: string) => void;
}) {
  return (
    <section>
      <div className="font-display text-[15px] mb-1">Par catégorie</div>
      {!insights.length && (
        <p className="text-ink-muted text-sm py-4">Aucune dépense ce mois.</p>
      )}
      {insights.map((i) => (
        <CategoryRow
          key={i.categoryId}
          insight={i}
          icon={categoryIcon(i.name)}
          onClick={() => onSelect(i.categoryId)}
        />
      ))}
    </section>
  );
}
