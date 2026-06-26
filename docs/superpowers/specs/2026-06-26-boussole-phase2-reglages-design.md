# Boussole Phase 2 — Réglages / user_settings

**Date** : 2026-06-26
**Branche** : `boussole-redesign`
**Roadmap parente** : `docs/superpowers/specs/2026-06-25-boussole-redesign-roadmap.md`
**Périmètre** : écran/modale **Réglages** + table `user_settings`. Persiste l'**objectif de taux d'épargne** (le hero Cockpit utilise `20 %` codé en dur) et la **devise de reporting** (prépare le multi-devises). Le **thème** reste local à l'appareil (localStorage) avec ajout de l'option **Système**.

## Décisions validées

- **Thème device-local** (localStorage), pas dans `user_settings` ; ajout de l'option **Système** (suit l'OS). Pas de flash au chargement (script `<head>` conservé/mis à jour).
- **`user_settings`** stocke `savings_rate_goal` + `reporting_currency` (1 ligne/user).
- **Sélecteur de devise** exposé maintenant (enregistre la préférence ; conversion réelle → feature multi-devises).
- Modale Réglages ouverte depuis l'en-tête Cockpit ; **`ThemeToggle` et « Déco » retirés de l'en-tête** (déplacés dans Réglages — le « réglage complet » annoncé en Phase 0).

## Données & sécurité

Migration `supabase/2026-06-26-user-settings.sql` (exécutée manuellement) :
```sql
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id),
  savings_rate_goal numeric not null default 0.20,
  reporting_currency text not null default 'EUR',
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
create policy "user_settings_per_user" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

## Modules purs (testés)

### `lib/cockpit/settings.ts`
```ts
export type UserSettings = {
  savings_rate_goal: number;
  reporting_currency: string;
};
export const DEFAULT_SETTINGS: UserSettings;        // { savings_rate_goal: 0.2, reporting_currency: "EUR" }
export const CURRENCIES: string[];                  // ["EUR","USD","GBP","CHF","CAD"]
export function coerceSettings(row: Partial<UserSettings> | null | undefined): UserSettings;
```
- `coerceSettings` : si `row` null/undefined → `DEFAULT_SETTINGS` ; sinon remplace les champs nuls/non-finis par les défauts (`savings_rate_goal` → `Number` fini sinon défaut ; `reporting_currency` → string non vide sinon "EUR").

**Tests** : null → défauts ; ligne complète conservée ; `savings_rate_goal` manquant → 0.2 ; devise vide → EUR.

### `lib/cockpit/theme.ts` (rework)
```ts
export type ThemePref = "light" | "dark" | "system";
export type Theme = "light" | "dark";
export function normalizePref(stored: string | null): ThemePref;   // défaut "system"
export function resolveTheme(pref: ThemePref, prefersDark: boolean): Theme;
export function nextTheme(current: Theme): Theme;                   // inchangé
```
- `normalizePref` : `"light"|"dark"|"system"` valides ; sinon (`null`, inconnu) → `"system"`.
- `resolveTheme` : `pref === "system"` → `prefersDark ? "dark" : "light"` ; sinon `pref`.
- L'ancien `resolveInitialTheme(stored, prefersDark)` est remplacé par `resolveTheme(normalizePref(stored), prefersDark)`.

**Tests** : `normalizePref` (light/dark/system/null/inconnu) ; `resolveTheme` (system→OS dans les deux sens, light/dark explicites ignorent l'OS) ; `nextTheme` (flip).

## API + hooks

### `lib/cockpit/user-settings-api.ts`
```ts
import type { UserSettings } from "./settings";
export async function getUserSettings(userId: string): Promise<UserSettings | null>;
export async function saveUserSettings(
  userId: string,
  s: { savingsRateGoal: number; reportingCurrency: string }
): Promise<void>;
```
- `getUserSettings` : select la ligne (`maybeSingle`) → `{ savings_rate_goal, reporting_currency }` ou `null`.
- `saveUserSettings` : `upsert({ user_id, savings_rate_goal, reporting_currency, updated_at: now }, { onConflict: "user_id" })`.

### `useUserSettings(userId)` (dans `hooks.ts`)
Charge via `getUserSettings` → `coerceSettings` ; expose `{ settings, refetch }` (jamais null : défauts si pas de ligne).

### `ThemeProvider` (rework, `components/cockpit/ThemeProvider.tsx`)
- État `pref: ThemePref` initialisé `normalizePref(localStorage.theme)`.
- `theme: Theme = resolveTheme(pref, prefersDark)` ; si `pref==="system"`, écoute `matchMedia('(prefers-color-scheme: dark)')` (change → recalcule).
- Applique `.dark` selon `theme` ; écrit `localStorage.theme = pref`.
- Expose `useTheme(): { theme, pref, setPref }`.
- **Anti-flash** (`app/layout.tsx`) : le script lit `localStorage.theme` → `dark` si `'dark'`, `light` si `'light'`, sinon (`'system'`/absent) selon `prefers-color-scheme`.

## UI

- **En-tête Cockpit** (`app/cockpit/page.tsx`) : retirer `<ThemeToggle/>` et le bouton « Déco » ; ajouter un bouton **gear** (lucide `Settings`) qui ouvre la modale Réglages (`showSettings`).
- **`ReglagesModal`** (`components/cockpit/ReglagesModal.tsx`, motif `AssetModal`) :
  - **Thème** : segmenté 3 boutons Clair / Sombre / Système → `setPref` (`useTheme`), appliqué en direct.
  - **Objectif de taux d'épargne** : champ `%` (valeur = `Math.round(savings_rate_goal*100)`, défaut 20) → stocké en fraction.
  - **Devise** : `select` sur `CURRENCIES`.
  - **Enregistrer** : `saveUserSettings(user.id, { savingsRateGoal: pct/100, reportingCurrency })` → `onSaved` (refetch settings + close).
  - **Déconnexion** : `supabase.auth.signOut()`.
- **Hero Cockpit** : `const goal = settings.savings_rate_goal` (au lieu de `GOAL = 0.2`) ; `savingsMood(metrics.tauxEpargne, goal)` ; passe `goal` à `HeroCard`.
- **Suppression** : `components/cockpit/ThemeToggle.tsx` n'est plus utilisé → supprimé.

## États & erreurs

- Pas de ligne `user_settings` : `useUserSettings` renvoie les défauts (goal 20 %, EUR) ; le premier Enregistrer crée la ligne (upsert).
- Erreur Supabase (get) : on retombe sur les défauts (pas de crash). Erreur (save) : message visible dans la modale.
- Objectif invalide (≤ 0 ou non numérique) : message « Objectif invalide », pas d'enregistrement.
- Thème : `localStorage` indisponible (mode privé) → `try/catch`, repli sur Système/OS.

## Hors périmètre

- Conversion multi-devises réelle (la devise n'est qu'enregistrée ici).
- Réglages avancés (notifications, export, profil) — hors sujet.
- Accès à Réglages depuis les autres écrans (pour l'instant : en-tête Cockpit).

## Critères de succès

- Le gear ouvre Réglages ; changer le **thème** (Clair/Sombre/Système) s'applique immédiatement et persiste au rechargement ; « Système » suit l'OS.
- Modifier l'**objectif de taux** met à jour le hero Cockpit (barre/mood) après enregistrement ; persiste.
- La **devise** s'enregistre (sélection conservée).
- **Déconnexion** fonctionne depuis Réglages.
- RLS : chaque user ne voit que sa ligne. `npm run test` vert (incl. `settings`, `theme`) ; `npx tsc --noEmit` clean ; `npm run build` OK.
- L'utilisateur a exécuté `supabase/2026-06-26-user-settings.sql`.
