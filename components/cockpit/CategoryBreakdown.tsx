import type { CategoryInsight } from "@/lib/cockpit/categories-analysis";
import type { Category } from "@/lib/cockpit/types";
import { categoryIcon } from "@/lib/cockpit/category-icon";
import { CategoryRow } from "./CategoryRow";

export function CategoryBreakdown({
  insights,
  categories,
  onSelect,
  onEditBudgets,
}: {
  insights: CategoryInsight[];
  categories: Category[];
  onSelect: (categoryId: string) => void;
  onEditBudgets: () => void;
}) {
  const budgetOf = (id: string) =>
    categories.find((c) => c.id === id)?.monthly_budget ?? null;
  return (
    <section>
      <div className="flex justify-between items-baseline mb-1">
        <div className="font-display text-[15px]">Par catégorie</div>
        <button
          type="button"
          onClick={onEditBudgets}
          className="text-[12px] text-ink-muted"
        >
          Budgets
        </button>
      </div>
      {!insights.length && (
        <p className="text-ink-muted text-sm py-4">Aucune dépense ce mois.</p>
      )}
      {insights.map((i) => (
        <CategoryRow
          key={i.categoryId}
          insight={i}
          Icon={categoryIcon(i.name)}
          budget={budgetOf(i.categoryId)}
          onClick={() => onSelect(i.categoryId)}
        />
      ))}
    </section>
  );
}
