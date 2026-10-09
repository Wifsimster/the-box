---
name: The Box
source: packages/frontend/src/index.css
mode: dark-only
colors:
  dark:
    background: "oklch(0.129 0.042 283.713)"
    foreground: "oklch(0.984 0.003 247.858)"
    card: "oklch(0.208 0.042 283.713)"
    card-foreground: "oklch(0.984 0.003 247.858)"
    popover: "oklch(0.208 0.042 283.713)"
    popover-foreground: "oklch(0.984 0.003 247.858)"
    primary: "oklch(0.702 0.183 293.541)"
    primary-foreground: "oklch(0.208 0.042 283.713)"
    secondary: "oklch(0.279 0.041 283.713)"
    secondary-foreground: "oklch(0.984 0.003 247.858)"
    muted: "oklch(0.279 0.041 283.713)"
    muted-foreground: "oklch(0.78 0.035 283.713)"
    accent: "oklch(0.279 0.041 283.713)"
    accent-foreground: "oklch(0.984 0.003 247.858)"
    destructive: "oklch(0.704 0.191 22.216)"
    destructive-foreground: "oklch(0.208 0.042 283.713)"
    border: "oklch(1 0 0 / 10%)"
    input: "oklch(1 0 0 / 15%)"
    ring: "oklch(0.78 0.18 320)"
    chart-1: "oklch(0.702 0.183 293.541)"
    chart-2: "oklch(0.696 0.17 162.48)"
    chart-3: "oklch(0.769 0.188 70.08)"
    chart-4: "oklch(0.627 0.265 303.9)"
    chart-5: "oklch(0.645 0.246 16.439)"
    brand-purple: "#a855f7"
    brand-pink: "#ec4899"
    neon-purple: "#a855f7"
    neon-pink: "#f472b6"
    neon-blue: "#3b82f6"
    neon-cyan: "#06b6d4"
    success: "#22c55e"
    warning: "#eab308"
    error: "#ef4444"
    score-high: "var(--success)"
    score-mid: "var(--warning)"
    score-low: "#f97316"
    medal-gold: "#fbbf24"
    medal-silver: "#94a3b8"
    medal-bronze: "#b45309"
    border-interactive: "oklch(0.7 0.25 300 / 0.5)"
    table-row-hover: "oklch(0.25 0.04 280 / 0.3)"
typography:
  sans: "'Inter', system-ui, -apple-system, sans-serif"
  mono: "'JetBrains Mono', monospace"
  scale: tailwind-default
rounded:
  base: 0.625rem
  sm: "calc(var(--radius) - 4px)"
  md: "calc(var(--radius) - 2px)"
  lg: "var(--radius)"
  xl: "calc(var(--radius) + 4px)"
  pill: 9999px
spacing:
  scale: tailwind-default
  control-h: "2.5rem (2.75rem on pointer: coarse)"
  card-padding: "1rem (1.5rem from 40rem)"
  header-h: "calc(3.5rem + env(safe-area-inset-top)) (4rem from 40rem)"
  bottom-nav-h: 4rem
components:
  style: new-york
  primitives: radix
  icons: lucide-react
  motion: framer-motion
---

# The Box — DESIGN.md

Ce fichier décrit le design system **tel qu'il existe dans le code** au moment
de sa rédaction. Il ne propose rien. Chaque valeur vient du fichier cité ; en
cas d'écart, le code fait foi et l'écart va dans [Known Gaps](#known-gaps).

Documents voisins, qui restent la référence détaillée :
`docs/ui-tokens.md` (contrat des tokens), `docs/oxygen-design-system.md`
(principes : accessibilité, hiérarchie d'actions), `docs/brand.md` (nom, voix,
mark).

## Overview

Jeu quotidien : une capture d'écran, un jeu à deviner. L'interface est une
**salle d'arcade sombre** — fond violet-nuit, une couleur d'action violette,
des néons (violet, rose, bleu, cyan) réservés aux moments de jeu, et des halos
(`--glow-*`) à la place des ombres portées. **Sombre uniquement** :
`color-scheme: dark` sur `:root`, pas de thème clair.

Six thèmes Premium (`[data-theme]` sur `<html>`) re-peignent `--primary`,
`--ring` et `--neon-*` ; `retro_80s` re-peint aussi les surfaces. Le chrome de
marque (`--brand-*`) n'est jamais re-peint.

## Colors

Source : `packages/frontend/src/index.css` (`:root`, l. 5–127 ; `@theme inline`,
l. 163–242). Tailwind v4, aucun `tailwind.config`.

### Rôles shadcn (sombre, défaut)

| Token | Valeur | Rôle |
| --- | --- | --- |
| `--background` | `oklch(0.129 0.042 283.713)` | Fond d'app |
| `--foreground` | `oklch(0.984 0.003 247.858)` | Texte principal |
| `--card` / `--popover` | `oklch(0.208 0.042 283.713)` | Cartes, dialogues, menus |
| `--primary` | `oklch(0.702 0.183 293.541)` | CTA principal (violet) |
| `--primary-foreground` | `oklch(0.208 0.042 283.713)` | Texte sur primary |
| `--secondary` / `--muted` / `--accent` | `oklch(0.279 0.041 283.713)` | Surfaces secondaires, survol de menu |
| `--muted-foreground` | `oklch(0.78 0.035 283.713)` | Texte secondaire (relevé de 0.704 pour l'AA) |
| `--destructive` | `oklch(0.704 0.191 22.216)` | Erreurs shadcn |
| `--destructive-foreground` | `oklch(0.208 0.042 283.713)` | Texte sur destructive (6,19:1) |
| `--border` | `oklch(1 0 0 / 10%)` | Bordure par défaut (`*` l. 244) |
| `--input` | `oklch(1 0 0 / 15%)` | Bordure de champ |
| `--ring` | `oklch(0.78 0.18 320)` | Focus |
| `--chart-1…5` | `oklch(0.702 0.183 293.541)`, `oklch(0.696 0.17 162.48)`, `oklch(0.769 0.188 70.08)`, `oklch(0.627 0.265 303.9)`, `oklch(0.645 0.246 16.439)` | Graphiques uniquement |

### Marque, néons, statut, paliers, médailles

| Famille | Tokens (valeur) | Règle |
| --- | --- | --- |
| Marque | `--brand-purple` `#a855f7`, `--brand-pink` `#ec4899` | Mark, lockup, cartes de partage. Jamais redéfinis par un thème. |
| Néons | `--neon-purple` `#a855f7`, `--neon-pink` `#f472b6`, `--neon-blue` `#3b82f6`, `--neon-cyan` `#06b6d4` | Accents de jeu, avec parcimonie. Dégradés autorisés : `from-neon-purple to-neon-pink`, la même à `/20`, `from-neon-blue to-neon-cyan` (`docs/ui-tokens.md`). |
| Statut | `--success` `#22c55e`, `--warning` `#eab308`, `--error` `#ef4444` | `error` pour les surfaces de jeu (mauvaise réponse), `destructive` pour les états shadcn. |
| Score | `--score-high` = `--success`, `--score-mid` = `--warning`, `--score-low` `#f97316` | Échelle de qualité. |
| Médailles | `--medal-gold` `#fbbf24`, `--medal-silver` `#94a3b8`, `--medal-bronze` `#b45309` | Podium uniquement. |
| Interaction | `--border-interactive` `oklch(0.7 0.25 300 / 0.5)`, `--table-row-hover` `oklch(0.25 0.04 280 / 0.3)` | Survol de carte, survol de ligne admin. |
| Aperçus de thème | `--theme-swatch-*-from/to` (l. 115–126) | Sélecteur de thème uniquement, jamais redéfinis. |

### Thèmes Premium (`index.css` l. 482–549)

| `data-theme` | `--primary` | `--ring` | `--neon-purple` / `--neon-pink` |
| --- | --- | --- | --- |
| `neon_pink` | `oklch(0.74 0.22 350)` | `oklch(0.78 0.2 350)` | `#f472b6` / `#ec4899` |
| `cyber_blue` | `oklch(0.74 0.18 230)` | `oklch(0.78 0.2 230)` | `#38bdf8` / `#22d3ee` |
| `emerald_matrix` | `oklch(0.74 0.18 150)` | `oklch(0.78 0.2 150)` | `#34d399` / `#10b981` |
| `sunset_blaze` | `oklch(0.74 0.18 40)` | `oklch(0.78 0.2 40)` | `#fb923c` / `#ef4444` |
| `retro_80s` | `oklch(0.72 0.26 350)` | `oklch(0.8 0.18 200)` | `#ff2e88` / `#2de2e6` |

`retro_80s` redéfinit aussi `--background` `oklch(0.13 0.07 305)`, `--card`
`oklch(0.2 0.08 308)`, `--popover` `oklch(0.18 0.08 308)`, `--secondary`
`oklch(0.26 0.08 320)`, `--muted` `oklch(0.26 0.07 308)`, `--muted-foreground`
`oklch(0.82 0.07 320)`, `--accent` `oklch(0.3 0.12 200)`, `--border`
`oklch(0.75 0.2 340 / 22%)`, `--input` `oklch(0.75 0.2 340 / 28%)`, les
`--glow-*` et `--text-shadow-neon`, plus une grille d'horizon fixe sur `body`.

## Typography

| Token | Valeur | Source |
| --- | --- | --- |
| `--font-sans` | `'Inter', system-ui, -apple-system, sans-serif` | `index.css` l. 210 |
| `--font-mono` | `'JetBrains Mono', monospace` | `index.css` l. 211 |

Échelle de tailles et de graisses : celle de Tailwind par défaut, aucun
`--text-*` personnalisé. Conventions observées : boutons `text-sm font-medium`
(`sm` : `text-xs`, `lg` : `text-base`, `xl` : `text-lg`), badges `text-xs
font-semibold`, champs `text-base md:text-sm` (16 px sur mobile, pas de zoom
iOS). `h1–h3` en `text-wrap: balance`. Titres de héros :
`.gradient-gaming-title` (dégradé neon-purple → neon-pink → neon-cyan, repli
`--color-foreground`) et `.text-shadow-neon`.

## Layout

- Espacement : échelle Tailwind par défaut (pas de 4 px), `gap-*`.
- `--control-h` : `2.5rem`, `2.75rem` sous `pointer: coarse` (cible tactile 44 px). Utilisé par Button `default`/`icon`, Input, Select, TabsList.
- `--card-padding` : `1rem`, `1.5rem` à partir de `40rem`.
- `--header-h` : `calc(3.5rem + env(safe-area-inset-top))`, `4rem` + inset à partir de `40rem`.
- `--bottom-nav-h` : `4rem` ; `--bottom-nav-space` = barre + inset bas, `0px` quand `:root[data-bottom-nav='hidden']`. Barre masquée à partir de `md` (`48rem`).
- `--page-h` : `100dvh` moins header et barre basse.
- `scroll-padding` haut/bas réglés sur header et barre (WCAG 2.4.11). `body { overflow-x: clip }`.

## Elevation

Pas d'échelle d'ombres propre : la profondeur passe par la surface (`card`
plus clair que `background`) et par les **halos**.

| Token | Valeur | Usage |
| --- | --- | --- |
| `--glow-sm` | `0 0 10px oklch(0.7 0.25 300 / 0.3)` | Survol léger, items de liste |
| `--glow-md` | `0 0 20px oklch(0.7 0.25 300 / 0.4)` | Survol de carte interactive, CTA |
| `--glow-lg` | `0 0 30px oklch(0.7 0.25 300 / 0.5)` | Révélation de palier, moments héros |
| `--glow-success` | `0 0 20px oklch(0.75 0.2 145 / 0.5)` | Bonne réponse |
| `--glow-warning` | `0 0 20px oklch(0.8 0.15 85 / 0.5)` | Avertissement |
| `--glow-error` | `0 0 20px oklch(0.7 0.22 25 / 0.5)` | Mauvaise réponse |
| `--glow-pink-sm` | `0 0 12px oklch(0.72 0.2 350 / 0.4)` | Tuile de carte sélectionnée |
| `--glow-pink-lg` | `0 0 40px -12px oklch(0.72 0.2 350 / 0.45)` | Carte tarifaire mise en avant |
| `--shadow-lift` | `0 10px 30px oklch(0 0 0 / 0.3)` | Presets Framer Motion (`src/lib/animations.ts`) |
| `--shadow-raised` | valeurs de `shadow-sm` Tailwind | Card, Button (`shadow-raised`) |
| `--shadow-cta` | valeurs de `shadow-lg` Tailwind | Button `gaming` au repos (`shadow-cta`) |
| `--text-shadow-neon` | 4 couches `oklch(0.65 0.2 293 / 0.8→0.2)`, 10→40 px | Titres de héros |

Utilitaires : `.glow-sm|md|lg`, `.glow-hover` (vers `--glow-md`),
`.card-interactive` (bordure `--border-interactive` + `--glow-md` au survol),
`.bg-grid-neon` (grille 50 × 50). L'anneau de focus de `.card-interactive`
suit `--ring` (donc le thème Premium actif).

## Shapes

`--radius: 0.625rem` (10 px) ; `@theme inline` dérive `sm` = 6 px, `md` =
8 px, `lg` = 10 px, `xl` = 14 px.

| Élément | Classe | Source |
| --- | --- | --- |
| Button (toutes tailles sauf `xl`), Input, badge `destructive` | `rounded-md` | `ui/button.tsx`, `ui/input.tsx`, `ui/badge.tsx` |
| Button `xl` | `rounded-lg` | `ui/button.tsx` |
| Card | `rounded-xl` | `ui/card.tsx` |
| Badge | `rounded-full` | `ui/badge.tsx` |
| Cadre d'avatar Premium | `9999px` | `.premium-frame` |

## Motion

| Token | Valeur | Usage |
| --- | --- | --- |
| `--duration-fast` | `150ms` | Survol, tooltip, pression |
| `--duration-normal` | `300ms` | Carte, modale, onglets |
| `--duration-slow` | `500ms` | Révélations |
| `--ease-smooth` | `cubic-bezier(0.4, 0, 0.2, 1)` | Défaut |
| `--ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | Entrées |
| `--ease-bounce` | `cubic-bezier(0.68, -0.55, 0.265, 1.55)` | Récompenses uniquement |

Boutons : `hover:scale-[1.02] active:scale-[0.98]` (`gaming` : 1.03).
`prefers-reduced-motion: reduce` ramène toutes les durées à `0.01ms`
(`index.css` l. 449–471).

## Components

shadcn `new-york`, primitives Radix, icônes `lucide-react`, animation
`framer-motion`, toasts `sonner` (`components.json`, `src/components/ui/`).

| Composant | Variantes propres | Source |
| --- | --- | --- |
| `Button` | `default`, `destructive` (`bg-destructive`), `outline`, `secondary`, `ghost`, `link`, `gaming` (dégradé neon-purple → neon-pink + `--glow-lg`), `warning`, `hintUsed`, `hintFree`, `ban`, `unban`, `dangerGhost`, `overlay` ; tailles `default` (`--control-h`), `sm` (h-8), `lg` (h-12), `xl` (h-14), `icon` | `ui/button.tsx` |
| `Card` | `default`, `neon`, `success`, `warning`, `error` (bordure teintée) ; prop `interactive` | `ui/card.tsx` |
| `Alert` | `default`, `destructive`, `warning`, `success`, `info`, `neon` | `ui/alert.tsx` |
| `Input` | `bg-card`, `border-border`, hauteur `--control-h` | `ui/input.tsx` |
| Toasts | `<Toaster />` unique dans `App.tsx`, shim `@/lib/toast` | `ui/sonner.tsx` |

Composants maison au-dessus des primitives : `animated-progress`,
`animated-tabs`, `game-carousel`, `gradient-icon`, `thinking-orb`,
`responsive-dialog` (Dialog sur desktop, bottom sheet sur mobile),
`confirm-dialog`, `loading-spinner`, `pagination-dots`, `month-picker`,
`password`.

Focus : `:focus-visible { outline: 2px solid var(--color-ring); outline-offset:
2px }` global ; Button et Badge utilisent `ring-2 ring-ring ring-offset-2`.

## Do's and Don'ts

**À faire**
- Passer par les tokens pour couleur, ombre, durée, courbe, rayon et police. La règle `no-raw-design-tokens` (Oxlint, `eslint-local/no-raw-design-tokens.js`) bloque la CI sur `src/**`.
- Une seule action primaire par contexte ; le destructif a sa propre variante.
- Exprimer l'esthétique gaming par des variantes CVA, pas en forkant la primitive.
- Peindre le mark et le lockup avec `--brand-*`.

**À éviter**
- Hex, `rgb()`, `oklch()` ou `shadow-[…]` bruts dans un composant (sauf `src/components/backgrounds/**`, Three.js).
- Redéfinir `--brand-*` ou `--theme-swatch-*` dans un bloc `[data-theme]`.
- Utiliser `score-*` pour un podium ou `medal-*` pour une qualité.
- Une autre police que Inter / JetBrains Mono.

## Responsive

Mobile d'abord. Ruptures utilisées par les tokens : `40rem` (`sm`, header et
padding de carte), `48rem` (`md`, la barre basse disparaît). `pointer: coarse`
pour la hauteur des contrôles. Unités `dvh`, insets `env(safe-area-inset-*)`,
`touch-action: manipulation` sur les contrôles, zoom Leaflet porté à 44 px.

## Known Gaps

Écarts constatés dans le code, non corrigés ici.

1. **Polices jamais chargées** : ni `@font-face`, ni Fontsource, ni Google Fonts pour Inter et JetBrains Mono. Le rendu tombe sur `system-ui` / la mono système sauf si la police est installée localement.
