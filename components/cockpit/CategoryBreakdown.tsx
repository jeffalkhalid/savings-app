import type { CategoryInsight } from "@/lib/cockpit/categories-analysis";
import { categoryIcon } from "@/lib/cockpit/category-icon";
import { CategoryRow } from "./CategoryRow";

export function CategoryBreakdown({
  insights,
  budgets,
  onSelect,
  onEditBudgets,
  onOpenMerchants,
  onOpenEvolution,
}: {
  insights: CategoryInsight[];
  budgets: Record<string, number>;
  onSelect: (categoryId: string) => void;
  onEditBudgets: () => void;
  onOpenMerchants: () => void;
  onOpenEvolution: () => void;
}) {
  const budgetOf = (id: string) => budgets[id] ?? null;
  return (
    <section>
      <div className="flex justify-between items-baseline mb-1">
        <div className="font-display text-[15px]">Par catégorie</div>
        <div className="flex items-baseline gap-3">
          <button
            type="button"
            onClick={onOpenEvolution}
            className="text-[12px] text-ink-muted"
          >
            Évolution
          </button>
          <button
            type="button"
            onClick={onOpenMerchants}
            className="text-[12px] text-ink-muted"
          >
            Commerçants
          </button>
          <button
            type="button"
            onClick={onEditBudgets}
            className="text-[12px] text-ink-muted"
          >
            Budgets
          </button>
        </div>
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
