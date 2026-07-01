"use client";

import { useState } from "react";
import { Archive, RotateCcw, Plus, ChevronDown, ChevronUp } from "lucide-react";
import type { Category } from "@/lib/cockpit/types";
import { categoryIcon } from "@/lib/cockpit/category-icon";
import {
  CATEGORY_COLORS,
  CAT_TYPE_LABELS,
  CAT_TYPE_ORDER,
  categoryNameError,
  type CatType,
} from "@/lib/cockpit/category-admin";
import {
  createCategory,
  updateCategory,
  setCategoryActive,
} from "@/lib/cockpit/categories-api";

export function CategoriesModal({
  userId,
  categories,
  onChanged,
  onClose,
}: {
  userId: string;
  categories: Category[];
  onChanged: () => void;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [colorFor, setColorFor] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<CatType>("expense");
  const [newColor, setNewColor] = useState(CATEGORY_COLORS[0]);

  const active = categories.filter((c) => c.active !== false);
  const archived = categories.filter((c) => c.active === false);
  const activeNames = active.map((c) => c.name);

  const run = async (fn: () => Promise<void>): Promise<boolean> => {
    setError("");
    setBusy(true);
    try {
      await fn();
      onChanged();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const rename = (c: Category, raw: string) => {
    const name = raw.trim();
    if (name === c.name) return;
    const err = categoryNameError(
      name,
      activeNames.filter((n) => n !== c.name)
    );
    if (err) {
      setError(err);
      return;
    }
    run(() => updateCategory({ id: c.id, name, color: c.color }));
  };

  const recolor = (c: Category, color: string) => {
    setColorFor(null);
    run(() => updateCategory({ id: c.id, name: c.name, color }));
  };

  const add = async () => {
    const err = categoryNameError(newName, activeNames);
    if (err) {
      setError(err);
      return;
    }
    const ok = await run(() =>
      createCategory(userId, {
        name: newName.trim(),
        type: newType,
        color: newColor,
      })
    );
    if (ok) setNewName("");
  };

  const swatch = (col: string, selected: boolean, onClick: () => void) => (
    <button
      key={col}
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={col}
      className={`w-7 h-7 rounded-full shrink-0 ${
        selected ? "ring-2 ring-ink ring-offset-1 ring-offset-paper" : ""
      }`}
      style={{ backgroundColor: col }}
    />
  );

  return (
    <div
      className="fixed inset-0 z-[1001] bg-black/50 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="bg-paper w-full max-w-[600px] max-h-[90vh] overflow-auto px-6 pt-6 pb-10 rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-center mb-4">
          <h2 className="font-display text-2xl">Catégories</h2>
          <button className="text-ink-muted text-sm" onClick={onClose} type="button">
            Fermer
          </button>
        </header>

        {CAT_TYPE_ORDER.map((t) => {
          const rows = active.filter((c) => c.type === t);
          if (!rows.length) return null;
          return (
            <section key={t} className="mb-4">
              <h3 className="text-xs uppercase tracking-[0.1em] text-ink-muted mb-2">
                {CAT_TYPE_LABELS[t]}
              </h3>
              <div className="grid gap-1.5">
                {rows.map((c) => {
                  const Icon = categoryIcon(c.name);
                  return (
                    <div key={c.id}>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setColorFor(colorFor === c.id ? null : c.id)
                          }
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: c.color + "22" }}
                          aria-label="Couleur"
                        >
                          <Icon size={16} style={{ color: c.color }} />
                        </button>
                        <input
                          defaultValue={c.name}
                          disabled={busy}
                          className="flex-1 bg-transparent text-ink text-sm border-b border-transparent focus:border-rule outline-none py-1"
                          onBlur={(e) => rename(c, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => run(() => setCategoryActive(c.id, false))}
                          disabled={busy}
                          className="text-ink-muted p-1.5"
                          aria-label="Archiver"
                        >
                          <Archive size={16} />
                        </button>
                      </div>
                      {colorFor === c.id && (
                        <div className="flex flex-wrap gap-1.5 pl-10 pb-1 pt-1">
                          {CATEGORY_COLORS.map((col) =>
                            swatch(
                              col,
                              c.color.toLowerCase() === col.toLowerCase(),
                              () => recolor(c, col)
                            )
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        {archived.length > 0 && (
          <section className="mb-4">
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="flex items-center gap-1 text-xs uppercase tracking-[0.1em] text-ink-muted mb-2"
            >
              Archivées ({archived.length})
              {showArchived ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showArchived && (
              <div className="grid gap-1.5">
                {archived.map((c) => {
                  const Icon = categoryIcon(c.name);
                  return (
                    <div key={c.id} className="flex items-center gap-2 opacity-70">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: c.color + "22" }}
                      >
                        <Icon size={16} style={{ color: c.color }} />
                      </div>
                      <span className="flex-1 text-sm text-ink-muted">{c.name}</span>
                      <button
                        type="button"
                        onClick={() => run(() => setCategoryActive(c.id, true))}
                        disabled={busy}
                        className="text-emerald text-[13px] flex items-center gap-1 p-1.5"
                        aria-label="Réactiver"
                      >
                        <RotateCcw size={15} /> Réactiver
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <section className="border-t border-rule pt-4">
          <h3 className="text-xs uppercase tracking-[0.1em] text-ink-muted mb-2">
            Ajouter
          </h3>
          <div className="grid gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nom de la catégorie"
              className="border border-rule rounded-lg px-3 py-2.5 bg-card text-ink text-sm w-full"
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as CatType)}
              className="border border-rule rounded-lg px-3 py-2.5 bg-card text-ink text-sm w-full"
            >
              {CAT_TYPE_ORDER.map((t) => (
                <option key={t} value={t}>
                  {CAT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_COLORS.map((col) =>
                swatch(col, newColor === col, () => setNewColor(col))
              )}
            </div>
            <button
              type="button"
              onClick={add}
              disabled={busy || !newName.trim()}
              className="bg-emerald text-[#FBF3EC] rounded-lg py-3 font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Plus size={17} /> Ajouter
            </button>
          </div>
        </section>

        {error && <p className="text-accent text-sm mt-3">{error}</p>}
      </div>
    </div>
  );
}
