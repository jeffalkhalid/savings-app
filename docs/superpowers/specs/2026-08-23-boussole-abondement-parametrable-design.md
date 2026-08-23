# Barème d'abondement paramétrable — spec

**Date** : 2026-08-23
**Contexte** : dernier point ouvert de la feuille de route Boussole (§5 « décisions à acter » :
« barème Carrefour (abondement en dur → paramétrable) »). Devenu réellement utile depuis
l'ouverture de l'app à des amis, qui n'ont pas le même employeur.

## 1. Problème

Le barème d'abondement employeur est codé en dur dans `lib/simulator.ts`, dans deux fonctions
privées `computeAbondementPEG` / `computeAbondementPER` dont les seuils et les taux sont ceux de
Carrefour. Tout utilisateur non-Carrefour obtient donc des projections d'épargne salariale fausses,
sans aucun moyen de les corriger depuis l'app. Trois écrans annoncent d'ailleurs explicitement
l'hypothèse (« abondement Carrefour ») : `app/page.tsx`, `components/cockpit/projection/SimulatorView.tsx`
et le footer de la page legacy.

## 2. Objectif

Chaque utilisateur peut saisir **son** barème d'abondement, persisté sur son compte, et voir le
simulateur recalculer en direct. Le barème Carrefour reste le défaut : sans action, rien ne change,
ni à l'écran ni dans les chiffres.

## 3. Modèle de données (module pur `lib/abondement.ts`)

Structure **par tranches**, choisie pour reproduire à l'identique le barème actuel (dégressif) et
couvrir n'importe quel employeur.

```ts
type Tranche = { upTo: number | null; rate: number }; // upTo: null = au-delà
type PlanBareme = {
  interessement: Tranche[];
  participation: Tranche[];
  volontaire: Tranche[];
};
type AbondementBareme = { peg: PlanBareme; per: PlanBareme };
```

- Une source **sans tranche** (`[]`) abonde 0 — c'est le cas de la participation PEG aujourd'hui.
- `DEFAULT_BAREME` reprend exactement les valeurs Carrefour actuelles :
  - PEG — intéressement `[{upTo: 450, rate: 0.4}, {upTo: null, rate: 0.2}]`, participation `[]`,
    volontaire `[{upTo: null, rate: 0.2}]`.
  - PER — intéressement `[{upTo: 1000, rate: 0.5}, {upTo: null, rate: 0.2}]`,
    participation `[{upTo: null, rate: 0.3}]`,
    volontaire `[{upTo: 550, rate: 1.0}, {upTo: 2000, rate: 0.5}, {upTo: null, rate: 0.25}]`.

> Note : le volontaire PEG actuel est plafonné à 1 000 000 € dans le code, ce que le commentaire
> qualifie de « pratiquement non plafonné ». La tranche `upTo: null` le rend franchement non
> plafonné ; l'écart n'est atteignable qu'avec un versement volontaire supérieur à 1 M€/an, hors
> de tout domaine réaliste. Décision : on assume la simplification.

### Fonctions

- `computeAbondement(plan: PlanBareme, I: number, P: number, V: number): number` — somme, pour
  chacune des trois sources, du montant abondé par application des tranches. Remplace les deux
  fonctions codées en dur.
- `baremeError(b: unknown): string | null` — validation : seuils strictement croissants, dernière
  tranche `upTo: null` autorisée une seule fois et en dernier, taux dans `[0, 2]`, montants finis
  et positifs. Retourne un message en français ou `null`.
- `parseBareme(raw: unknown): AbondementBareme` — parse tolérant du JSONB : `null`, absent ou
  invalide → `DEFAULT_BAREME`. Jamais d'exception : un barème corrompu en base ne doit pas casser
  l'écran Épargne.

Tous testés en Vitest, y compris un test qui vérifie que `computeAbondement` sur `DEFAULT_BAREME`
reproduit **exactement** les chiffres des anciennes fonctions (non-régression du modèle financier).

## 4. Intégration simulateur

- `SimulationParams` gagne un champ `bareme: AbondementBareme` ; `DEFAULT_PARAMS` embarque
  `DEFAULT_BAREME`.
- `lib/simulator.ts` : suppression de `computeAbondementPEG` / `computeAbondementPER`, remplacées
  par `computeAbondement(p.bareme.peg, …)` et `computeAbondement(p.bareme.per, …)`. Aucun autre
  changement dans la mécanique de simulation.
- `buildSimParams` (`lib/cockpit/projection-sim.ts`) accepte un `bareme` optionnel, défaut
  `DEFAULT_BAREME`.
- **Non-régression** : `lib/simulator.ts` n'a aujourd'hui **aucun test** — `projection-sim.test.ts`
  ne couvre que `buildSimParams` / `rankByNet`. Le garde-fou doit donc être écrit **avant** la
  refonte : un test de caractérisation `lib/simulator.test.ts` qui fige les `summary` de
  `simulateAll(DEFAULT_PARAMS)` pour les six stratégies (valeurs relevées sur le code actuel), plus
  un jeu de versements non nuls. Ce test doit passer inchangé après le remplacement des fonctions
  codées en dur. Sans lui, la refonte se fait à l'aveugle.

## 5. Persistance

- Migration `supabase/2026-08-23-abondement-bareme.sql` :
  `alter table user_settings add column if not exists abondement_bareme jsonb;`
  `NULL` = barème par défaut. Pas de RLS nouvelle : `user_settings` est déjà en `auth.uid() = user_id`.
- `lib/cockpit/user-settings-api.ts` : la colonne entre dans le `select` et dans l'upsert.
  `UserSettings` gagne `abondement_bareme: unknown | null`, converti par `parseBareme` côté hook.
- Écriture d'un barème identique au défaut : on enregistre quand même l'objet (simple, évite une
  comparaison profonde) ; l'étiquette « Personnalisé / Carrefour (défaut) » se base sur une
  égalité structurelle avec `DEFAULT_BAREME`.

## 6. UI — onglet Épargne

L'édition vit **dans le simulateur**, seul consommateur du barème, pour que l'effet du réglage soit
visible immédiatement.

- Sous `SimulatorControls`, une ligne cliquable : libellé « Barème d'abondement » + valeur
  « Carrefour (défaut) » ou « Personnalisé », chevron lucide.
- Ouvre une bottom-sheet `BaremeModal.tsx`, bâtie sur le même patron que les modales existantes
  (`BudgetsModal` / `CategoriesModal` — il n'y a pas de primitive `Sheet` partagée dans ce repo) :
  - segmenté **PEG / PER** ;
  - pour le plan sélectionné, trois blocs (Intéressement, Participation, Volontaire) ;
  - chaque bloc liste ses tranches : champ seuil (€, vide = « au-delà ») + champ taux (%), bouton
    supprimer ; bouton « Ajouter une tranche » ; un bloc vide affiche « Pas d'abondement ».
  - erreurs de validation affichées sous le bloc concerné, enregistrement bloqué tant qu'il y a
    une erreur ;
  - actions : « Réinitialiser (Carrefour) » et « Enregistrer ».
- Sauvegarde → upsert `user_settings` → `SimulatorView` recalcule le classement des stratégies.
- Le texte « Hypothèses par défaut (abondement Carrefour) » de `SimulatorView` devient dynamique
  (« abondement Carrefour » / « votre barème »).
- Contraintes maison : icônes **lucide-react** uniquement (jamais d'emoji), montants en
  `.font-mono-num`, tokens Boussole.

## 7. Hors périmètre

- La page legacy `/` (réglage fin complet, `ParameterPanel`) **n'est pas branchée** sur le barème
  personnel : elle n'a pas de session utilisateur et sert de bac à sable expert. Elle continue sur
  `DEFAULT_PARAMS`. Seul son footer est corrigé (il pointe aujourd'hui l'utilisateur vers
  `lib/strategies.ts`, ce qui devient faux : il mentionnera l'onglet Épargne).
- Pas de bibliothèque de barèmes pré-remplis par employeur : YAGNI tant qu'on est quelques amis.
- Pas de partage de barème entre utilisateurs (rien à voir avec les catégories communes).
- Plafonds annuels `plafondPEG` / `plafondPER` : déjà paramétrables ailleurs, inchangés.

## 8. Tests & vérification

- Vitest sur `lib/abondement.ts` : calcul par tranches (source vide, une tranche, tranches
  multiples, montant à cheval sur un seuil, montant nul), non-régression vs valeurs Carrefour,
  `baremeError` (seuils décroissants, `upTo: null` en milieu de liste, taux négatif ou aberrant),
  `parseBareme` (null, objet partiel, JSON étranger).
- `lib/simulator.test.ts` (test de caractérisation neuf, écrit **avant** la refonte) : vert avant et
  après, aux mêmes valeurs.
- `npx tsc --noEmit` + `npm run build`.
- Smoke : onglet Épargne, édition d'une tranche, rechargement de page, valeur persistée.

## 9. Critère de succès

Un utilisateur non-Carrefour saisit son propre barème depuis l'onglet Épargne, le retrouve après
rechargement, et le classement des stratégies reflète ses taux. Un utilisateur qui ne touche à rien
voit exactement les mêmes chiffres qu'avant.
