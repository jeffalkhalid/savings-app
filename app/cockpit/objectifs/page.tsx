"use client";

import { useMemo, useState } from "react";
import { useAuth, useGoals, useGoalContributions } from "@/lib/cockpit/hooks";
import { goalsSummary, applyContributions, type Goal } from "@/lib/cockpit/goals";
import { todayISO } from "@/lib/cockpit/format";
import { Target, Plus } from "lucide-react";
import { GoalRing } from "@/components/cockpit/goals/GoalRing";
import { GoalCard } from "@/components/cockpit/goals/GoalCard";
import { GoalModal } from "@/components/cockpit/goals/GoalModal";
import { ContributeModal } from "@/components/cockpit/goals/ContributeModal";

export default function ObjectifsPage() {
  const user = useAuth();
  const { goals, loading, error, refetch } = useGoals();
  const [showCreate, setShowCreate] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [contribGoal, setContribGoal] = useState<Goal | null>(null);
  const { contribByGoal } = useGoalContributions();
  const effGoals = useMemo(
    () => applyContributions(goals, contribByGoal),
    [goals, contribByGoal]
  );
  const today = todayISO();
  const summary = useMemo(() => goalsSummary(effGoals), [effGoals]);

  return (
    <main className="max-w-[600px] mx-auto px-5 pt-8">
      <header className="mb-4">
        <h1 className="font-display text-2xl">Objectifs</h1>
      </header>

      {error && <p className="text-accent text-sm mb-2">{error}</p>}

      {summary.totalTarget > 0 && (
        <GoalRing
          pct={summary.pct}
          totalCurrent={summary.totalCurrent}
          totalTarget={summary.totalTarget}
        />
      )}

      {loading && !goals.length && (
        <p className="text-ink-muted text-sm py-4">Chargement…</p>
      )}
      {!loading && !error && !goals.length && (
        <div className="text-center py-10 text-ink-muted">
          <Target size={30} className="mx-auto mb-2" />
          <div className="text-sm font-semibold text-ink">Aucun objectif</div>
          <div className="text-xs mt-0.5">Fixe ta première cible d&apos;épargne.</div>
        </div>
      )}

      {effGoals.map((eg) => {
        const orig = goals.find((g) => g.id === eg.id) ?? eg;
        return (
          <GoalCard
            key={eg.id}
            goal={eg}
            today={today}
            onContribute={() => setContribGoal(orig)}
            onEdit={() => setEditGoal(orig)}
          />
        );
      })}

      <button
        type="button"
        onClick={() => setShowCreate(true)}
        className="w-full mt-3 border-2 border-dashed border-rule rounded-2xl py-3.5 text-sm font-semibold text-ink-muted flex items-center justify-center gap-1.5"
      >
        <Plus size={16} /> Ajouter un objectif
      </button>

      {showCreate && (
        <GoalModal
          userId={user.id}
          goal={null}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            refetch();
            setShowCreate(false);
          }}
        />
      )}
      {editGoal && (
        <GoalModal
          userId={user.id}
          goal={editGoal}
          onClose={() => setEditGoal(null)}
          onSaved={() => {
            refetch();
            setEditGoal(null);
          }}
        />
      )}
      {contribGoal && (
        <ContributeModal
          goal={contribGoal}
          onClose={() => setContribGoal(null)}
          onSaved={() => {
            refetch();
            setContribGoal(null);
          }}
        />
      )}
    </main>
  );
}
