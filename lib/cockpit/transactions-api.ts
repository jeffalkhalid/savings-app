import { supabase } from "./supabase";
import { signedAmount } from "./transactions";

export type TxnFields = {
  date: string;
  absAmount: number;
  description: string; // raw user input (may be empty)
  categoryId: string;
  categoryName: string;
  accountId: string;
  categoryType: string;
  goalId?: string | null;
};

// Shared column mapping. description falls back to the category name;
// merchant keeps the raw user input (or null). Matches the original AddModal insert.
function row(f: TxnFields) {
  return {
    date: f.date,
    amount: signedAmount(f.absAmount, f.categoryType),
    description: f.description || f.categoryName,
    merchant: f.description || null,
    category_id: f.categoryId,
    account_id: f.accountId,
    type: f.categoryType,
    goal_id: f.categoryType === "savings" ? (f.goalId ?? null) : null,
  };
}

export async function createTransaction(
  userId: string,
  f: TxnFields
): Promise<void> {
  const { error } = await supabase.from("transactions").insert({
    user_id: userId,
    ...row(f),
    source: "manual",
  });
  if (error) throw new Error(error.message);
}

export async function updateTransaction(
  id: string,
  f: TxnFields
): Promise<void> {
  const { error } = await supabase
    .from("transactions")
    .update(row(f))
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Reclasse plusieurs transactions d'un coup.
 *
 * Met à jour le `type` en même temps que la catégorie : le type d'une
 * transaction est dérivé de sa catégorie, et le laisser en arrière ferait
 * compter une ligne déplacée vers « Épargne » comme une dépense — taux
 * d'épargne et reste à vivre faussés, sans aucun signal.
 *
 * Découpé par lots de 200 comme `deleteTransactions` ci-dessous : un `in (…)`
 * de plusieurs centaines d'identifiants tient dans l'URL jusqu'au jour où il
 * n'y tient plus (414 illisible). Le tri par commerçant sur tout l'historique
 * est le premier appelant capable de dépasser ce seuil — `merchantKey`
 * regroupe par exemple tous les retraits DAB sous une seule clé. Les lots
 * partent en série ; si l'un échoue, les précédents sont déjà appliqués.
 */
export async function updateTransactionsCategory(
  ids: string[],
  categoryId: string,
  type: string
): Promise<void> {
  if (!ids.length) return;
  // `goal_id` suit la même règle que partout ailleurs (voir `row()` et
  // TxnModal) : une transaction qui n'est plus de l'épargne ne doit plus
  // alimenter la progression d'un objectif. Sans ça, elle y resterait comptée
  // en silence. On ne touche pas au lien quand la cible EST de l'épargne.
  const patch =
    type === "savings"
      ? { category_id: categoryId, type }
      : { category_id: categoryId, type, goal_id: null };
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    if (!slice.length) continue;
    const { error } = await supabase
      .from("transactions")
      .update(patch)
      .in("id", slice);
    if (error) throw new Error(error.message);
  }
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Suppression en masse, par lots.
 *
 * Découpé parce qu'un `in (…)` de plusieurs centaines d'identifiants tient dans
 * l'URL jusqu'au jour où il n'y tient plus, et l'échec serait alors un 414
 * illisible plutôt qu'une erreur métier. Les lots partent en série : si l'un
 * échoue, les précédents sont déjà supprimés et l'appelant doit recharger —
 * c'est pourquoi `useBulkDelete` appelle `onDone()` même sur le chemin d'erreur.
 */
/**
 * Vide toutes les opérations d'un utilisateur.
 *
 * Le filtre sur `user_id` est redondant avec la RLS, et il est là quand même :
 * il rend l'intention lisible, et une politique mal configurée ne doit pas être
 * la seule chose entre l'utilisateur et la table entière.
 *
 * Ce qui SURVIT : catégories, règles de classement, engagements, budgets,
 * objectifs, patrimoine, réglages. Rien ne dépend en cascade des transactions —
 * `goal_id` pointe des transactions vers les objectifs, pas l'inverse.
 */
export async function deleteAllTransactions(userId: string): Promise<void> {
  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function deleteTransactions(ids: string[]): Promise<void> {
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    if (!slice.length) continue;
    const { error } = await supabase
      .from("transactions")
      .delete()
      .in("id", slice);
    if (error) throw new Error(error.message);
  }
}

export type ImportRow = {
  date: string; // ISO
  amount: number; // signé brut (préservé tel quel)
  description: string;
  categoryId: string;
  type: string;
  accountId: string;
};

// Insert en masse. Préserve le montant signé (ne repasse PAS par signedAmount).
export async function createTransactionsBulk(
  userId: string,
  rows: ImportRow[]
): Promise<void> {
  if (!rows.length) return;
  const { error } = await supabase.from("transactions").insert(
    rows.map((r) => ({
      user_id: userId,
      date: r.date,
      amount: r.amount,
      description: r.description,
      merchant: r.description || null,
      category_id: r.categoryId,
      account_id: r.accountId,
      type: r.type,
      // "manual" : la contrainte CHECK transactions_source_check n'autorise pas
      // "import". Provenance non utilisée par le cockpit ; rebascule sur "import"
      // si tu ajoutes la valeur à la contrainte côté Supabase.
      source: "manual",
    }))
  );
  if (error) throw new Error(error.message);
}
