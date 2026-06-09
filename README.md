# Simulateur épargne salariale (PEG · PER · PEA)

App Next.js 15 (App Router, React 19, TypeScript) qui compare 6 stratégies d'épargne salariale en temps réel avec recyclage récursif et fiscalité de sortie complète.

## Démarrer

```bash
npm install
npm run dev
```

Puis ouvre [http://localhost:3000](http://localhost:3000).

## Les 6 stratégies

| Clé | Stratégie | Hypothèse |
|---|---|---|
| A | PEG agressif | 100% PEG, recyclage récursif |
| B | PER pur | 100% PER, pas de recyclage |
| C | PEG → PER (saturation) | PEG jusqu'à plafond M saturé, puis PER |
| D | PEG 5 ans → PER | Amorçage 5 ans puis PER |
| E | PEG smart | 100% PEG, retrait limité au strict nécessaire |
| F | PEG 5 ans smart + PER | D combiné avec retrait optimal |

## Modèle fiscal

- **CSG plus-values** : 18,6 % sur le recyclage et la sortie PEG
- **CSG abondement (entrée)** : 9,7 % sur l'intéressement, la participation et l'abondement employeur
- **Sortie PER** : TMI sur le capital volontaire déductible + PFU 30 % sur les plus-values
- **Bonus PEA** : économie d'IR sur volontaire PER réinvestie à 6 %, CSG 17,2 % sur les plus-values

Tous les taux sont modifiables dans la sidebar.

## Architecture

```
app/
  layout.tsx        Layout racine + polices
  page.tsx          Page principale
  globals.css       Tailwind + styles custom
components/
  ParameterPanel.tsx    Sidebar de paramètres
  StrategyRanking.tsx   Grille des 6 stratégies, classement
  ComparisonChart.tsx   Graphique chronologique (recharts)
  StrategyDetail.tsx    Détail fiscalité de la stratégie sélectionnée
lib/
  simulator.ts          Moteur de simulation (port du sim Python)
  strategies.ts         Métadonnées + barème d'abondement + defaults
  types.ts              Types TS
  format.ts             Formatters fr-FR (euro, %, multiplicateur)
```

## Adapter les barèmes d'abondement

Les barèmes Carrefour sont codés en dur dans `lib/simulator.ts` :

```ts
function computeAbondementPEG(I, P, V) {
  // I (intéressement) : 0-450 @40%, 450+ @20%
  // P (participation) : 0%
  // V (volontaire) : 0-1M @20%
}

function computeAbondementPER(I, P, V) {
  // I : 0-1000 @50%, 1000+ @20%
  // P : 30%
  // V : 0-550 @100%, 550-2000 @50%, 2000+ @25%
}
```

Adapte-les à ton entreprise si besoin.

## Déploiement

Compatible Vercel out of the box : `vercel deploy`.
