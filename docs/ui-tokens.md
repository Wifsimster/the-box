# Contrat des tokens UI

Référence faisant autorité pour tous les tokens de design du frontend. Document destiné aux développeurs frontend et aux designers. La source de vérité vit dans `packages/frontend/src/index.css` sous `:root` et `@theme inline`. Tout valeur absente de ce document ne doit pas apparaître dans le code des composants.

> **Règle d'or.** Couleurs, ombres, durées, courbes d'animation, rayons et polices passent **toujours** par les tokens. Les valeurs brutes `#hex`, `rgb()`, `rgba()`, `oklch(...)` ou les `boxShadow` inline sont interdits sans ajout préalable d'un token.

---

## Palette — surface et sémantique

Toutes les classes shadcn `bg-*` / `text-*` / `border-*` résolvent à travers cette couche.

| Token | CSS var | Tailwind class | Usage |
|---|---|---|---|
| Background | `--background` / `--color-background` | `bg-background` | App canvas, page root |
| Foreground | `--foreground` / `--color-foreground` | `text-foreground` | Default body text |
| Card | `--card` / `--color-card` | `bg-card` | Elevated surfaces (Card, Dialog) |
| Card FG | `--card-foreground` | `text-card-foreground` | Text on card surfaces |
| Popover | `--popover` | `bg-popover` | Popover, DropdownMenu, Tooltip |
| Popover FG | `--popover-foreground` | `text-popover-foreground` | Text inside popovers |
| Primary | `--primary` | `bg-primary` / `text-primary` | Primary CTA, focus emphasis (violet) |
| Primary FG | `--primary-foreground` | `text-primary-foreground` | Text on primary |
| Secondary | `--secondary` | `bg-secondary` | Secondary surfaces, muted panels |
| Secondary FG | `--secondary-foreground` | `text-secondary-foreground` | Text on secondary |
| Muted | `--muted` | `bg-muted` | Disabled / low-emphasis surfaces |
| Muted FG | `--muted-foreground` | `text-muted-foreground` | Secondary text, placeholder, help copy |
| Accent | `--accent` | `bg-accent` | Hover/selected states for menus |
| Accent FG | `--accent-foreground` | `text-accent-foreground` | Text on accent |
| Destructive | `--destructive` | `bg-destructive` / `text-destructive` | Errors, destructive CTAs |
| Destructive FG | `--destructive-foreground` | `text-destructive-foreground` | Text on destructive |
| Border | `--border` | `border-border` (global default) | Default component border |
| Input | `--input` | `bg-input` | Input surfaces |
| Ring | `--ring` | `ring-ring` / `focus-visible:ring-ring` | Focus ring |

## Palette — néons gaming

À utiliser avec parcimonie et de manière sémantique. Ce sont des accents identitaires, pas des couleurs polyvalentes.

| Token | Value | Tailwind class | When to use |
|---|---|---|---|
| Neon Purple | `--neon-purple` = `#a855f7` | `text-neon-purple` / `bg-neon-purple` | Primary gaming accent, tier reveals, scoring highlights |
| Neon Pink | `--neon-pink` = `#ec4899` | `text-neon-pink` / `bg-neon-pink` | Paired with purple in gradients; alt primary accent |
| Neon Blue | `--neon-blue` = `#3b82f6` | `text-neon-blue` / `bg-neon-blue` | Informational, hints, tutorial callouts |
| Neon Cyan | `--neon-cyan` = `#06b6d4` | `text-neon-cyan` / `bg-neon-cyan` | Cold-tone accents, stats, counters |

**Combinaisons de dégradés autorisées :**

- `bg-gradient-to-r from-neon-purple to-neon-pink` — CTA de héros, bannière de révélation de palier
- `bg-gradient-to-br from-neon-purple/20 to-neon-pink/20` — accent subtil sur surface
- `bg-gradient-to-r from-neon-blue to-neon-cyan` — chips info / stats

Tout autre dégradé néon doit être proposé et ajouté à cette section avant déploiement.

## Palette — statut

Pour les badges, toasts, bannières et états de succès.

| Token | Value | Tailwind class |
|---|---|---|
| Success | `--success` = `#22c55e` | `text-success` / `bg-success` |
| Warning | `--warning` = `#eab308` | `text-warning` / `bg-warning` |
| Error | `--error` = `#ef4444` | `text-error` / `bg-error` |

Préférez `bg-destructive` à `bg-error` pour les états de composants shadcn qui passent déjà par le canal destructif (erreurs de formulaire, confirmations de suppression). `bg-error` est réservé aux surfaces gaming custom (mauvaise réponse, série rompue).

## Palette — paliers de score

Pour le retour qualitatif sur les surfaces de scoring (cartes de résultat, chips Metacritic, badges de vitesse, records personnels). Sémantiquement distincte des statuts — ce sont des paliers sur une échelle de qualité, pas des signaux de succès/erreur.

| Token | Value | Tailwind class | When to use |
|---|---|---|---|
| Score High | `--score-high` = `var(--success)` | `text-score-high` / `bg-score-high` | Excellent tier: ≥75 metacritic, sub-5s guess, top personal best |
| Score Mid | `--score-mid` = `var(--warning)` | `text-score-mid` / `bg-score-mid` | Fair tier: 50–74 metacritic, 5–15s guess |
| Score Low | `--score-low` = `#f97316` | `text-score-low` / `bg-score-low` | Low tier: <50 metacritic, slow guess, ongoing streak accent |

## Palette — médailles

Pour le podium des classements et les accents de type trophée. Distinct des paliers de score — les médailles sont catégorielles (1er, 2e, 3e), pas une échelle de qualité.

| Token | Value | Tailwind class | When to use |
|---|---|---|---|
| Medal Gold | `--medal-gold` = `#fbbf24` | `bg-medal-gold` / `text-medal-gold` / `from-medal-gold` | 1st-place podium, top achievements |
| Medal Silver | `--medal-silver` = `#94a3b8` | `bg-medal-silver` / `text-medal-silver` / `from-medal-silver` | 2nd-place podium |
| Medal Bronze | `--medal-bronze` = `#b45309` | `bg-medal-bronze` / `text-medal-bronze` / `from-medal-bronze` | 3rd-place podium |

Ne pas utiliser les tokens médailles pour signaler la qualité (réservé à `score-*`). Ne pas utiliser les tokens de score pour les positions du podium.

## Palette — graphiques

Exposée pour de futurs tableaux de bord. Pas pour l'habillage UI général.

| Token | Usage |
|---|---|
| `--chart-1`…`--chart-5` | Charts, graphs, visualizations only |

---

## Accents de surface

Teintes de surface ponctuelles qui ne rentrent pas dans une catégorie sémantique.

| Token | Value | When to use |
|---|---|---|
| `--table-row-hover` | `oklch(0.25 0.04 280 / 0.3)` | Row hover tint for admin data tables (used by `motion.tr whileHover`). |

## Ombres et halos

Toute valeur `box-shadow` dans un composant doit référencer un de ces tokens.

| Token | Value | Intended use |
|---|---|---|
| `--glow-sm` | `0 0 10px oklch(0.7 0.25 300 / 0.3)` | Subtle focus / hover on list items |
| `--glow-md` | `0 0 20px oklch(0.7 0.25 300 / 0.4)` | Default hover on interactive cards, primary CTAs |
| `--glow-lg` | `0 0 30px oklch(0.7 0.25 300 / 0.5)` | Tier reveal, score reveal, hero moments only |
| `--glow-success` | `0 0 20px oklch(0.75 0.2 145 / 0.5)` | Correct-guess pulse, success input state |
| `--glow-warning` | `0 0 20px oklch(0.8 0.15 85 / 0.5)` | Cautionary progress bars, pending warnings |
| `--glow-error` | `0 0 20px oklch(0.7 0.22 25 / 0.5)` | Wrong-guess shake, error input state |
| `--glow-pink-sm` | `0 0 12px oklch(0.72 0.2 350 / 0.4)` | Pink selection ring (selected map tile) |
| `--glow-pink-lg` | `0 0 40px -12px oklch(0.72 0.2 350 / 0.45)` | Diffuse pink card halo (highlighted pricing card) |
| `--text-shadow-neon` | stacked neon text shadow | Hero titles (TierIntro, landing heroes) |

**Classes utilitaires déjà câblées :**

- `.glow-purple` / `.glow-pink` / `.glow-blue` — halos hérités à teinte fixe. **Obsolètes** au profit des tokens `--glow-*` ; ne pas utiliser dans du nouveau code.
- `.text-glow` — ombre de texte à `currentColor`. Utilisable.
- `.text-shadow-neon` — ombre de texte néon empilée pour les titres de héros.
- `.glow-hover` — anime vers `--glow-md` au survol, respecte `--ease-smooth`.
- `.card-interactive` — traitement complet de carte interactive (bordure + halo).
- `.bg-grid-neon` — fond grille néon 50×50 pour les écrans héros.

**Anti-patterns d'ombres à corriger lors d'une migration :**

- `box-shadow: 0 0 20px rgba(168, 85, 247, 0.3)` inline → remplacer par `className="glow-hover"` ou `style={{ boxShadow: 'var(--glow-md)' }}`.
- `boxShadow: '0 0 20px oklch(...)'` en JSX → remplacer par `var(--glow-sm|md|lg)`.

## Rayons

| Token | Value | Tailwind class |
|---|---|---|
| `--radius-sm` | `calc(--radius - 4px)` → `0.25rem` | `rounded-sm` |
| `--radius-md` | `calc(--radius - 2px)` → `0.375rem` | `rounded-md` |
| `--radius-lg` | `--radius` → `0.625rem` | `rounded-lg` |
| `--radius-xl` | `calc(--radius + 4px)` → `0.875rem` | `rounded-xl` |

Évitez les `rounded-[12px]` arbitraires sauf justification design dans la PR.

## Typographie

| Token | Value | Tailwind class |
|---|---|---|
| `--font-sans` | `'Inter', system-ui, -apple-system, sans-serif` | `font-sans` (default) |
| `--font-mono` | `'JetBrains Mono', monospace` | `font-mono` |

Aucune autre police n'est autorisée. Les échelles de graisse et de taille suivent les valeurs Tailwind par défaut.

## Animation — durée et courbe

| Token | Value | When to use |
|---|---|---|
| `--duration-fast` | `150ms` | Hover color flips, tooltip fade, button press |
| `--duration-normal` | `300ms` | Card hover, modal open, tab swap |
| `--duration-slow` | `500ms` | Tier reveal, score count-up, large transitions |
| `--ease-smooth` | `cubic-bezier(0.4, 0, 0.2, 1)` | Default for all transitions |
| `--ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | Entry animations (fade-in, slide-in) |
| `--ease-bounce` | `cubic-bezier(0.68, -0.55, 0.265, 1.55)` | Achievement unlock, reward reveal only |

**Framer Motion :** préférez ces valeurs aux littéraux `duration: 0.3` codés en dur.

```tsx
transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }} // ← ease-smooth
```

Respectez `@media (prefers-reduced-motion: reduce)` — `index.css` neutralise déjà les durées globalement pour les utilisateurs sensibles. N'ajoutez pas de règles `!important` qui contournent ce comportement.

---

## Règles d'usage

### ✅ À faire

```tsx
<button className="bg-primary text-primary-foreground glow-hover rounded-lg">
  Play
</button>

<div
  className="card-interactive rounded-lg border"
  style={{ boxShadow: 'var(--glow-md)' }}
>
  {...}
</div>

<motion.div
  transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
/>
```

### ❌ À éviter

```tsx
<div style={{ boxShadow: '0 0 20px rgba(168, 85, 247, 0.3)' }} />
<div className="bg-[#a855f7]" />
<div className="shadow-[0_0_20px_oklch(0.7_0.25_300)]" />
<div style={{ background: 'linear-gradient(to right, #a855f7, #ec4899)' }} />
```

---

## Gouvernance

1. **Aucune couleur ou ombre brute dans les composants.** Tout ce qui n'est pas listé ici nécessite un ajout de token et une revue de PR.
2. **Primitives Radix/shadcn d'abord.** Les nouveaux composants custom doivent composer `@/components/ui/*` sauf nouveau cas métier.
3. **Variantes CVA, pas de nouveaux composants.** L'esthétique gaming sur les primitives shadcn s'exprime via `class-variance-authority`, pas en forkant la primitive.
4. **Les migrations passent par la couche de tokens.** Lors d'un remplacement de composant, replier les couleurs/ombres ponctuelles dans un token et déprécier la valeur brute.

### Application via lint

Une règle ESLint locale, `design-tokens/no-raw-design-tokens` (source : `packages/frontend/eslint-local/no-raw-design-tokens.js`), applique les règles ci-dessus en CI. Elle signale :

- **Littéraux de couleur bruts** — `rgba(`, `oklch(`, `hsl(`, `#RRGGBB[AA]`.
- **Utilitaires de palette Tailwind** — `bg-red-500`, `text-amber-400`, `border-cyan-600`, `from-green-500` (toutes les échelles de teintes brutes hors couche de tokens).
- **Valeurs Tailwind arbitraires avec couleurs brutes** — `shadow-[0_0_20px_rgba(...)]`, `bg-[#a855f7]`. Les valeurs arbitraires référençant une variable CSS (`shadow-[var(--glow-md)]`) restent autorisées.

**Sévérité par périmètre** dans `packages/frontend/eslint.config.js` :

| Périmètre | Sévérité |
|-----------|----------|
| `src/**` | **error** — bloque la CI |
| `src/components/backgrounds/**` | désactivé (les matériaux Three.js nécessitent des hex bruts) |

Chaque sprint de migration promeut un glob supplémentaire de warn → error. Ne jamais redescendre un glob déjà promu.

---

## Variantes des primitives

### `Card` (`@/components/ui/card`)

Propulsée par `class-variance-authority`. Préférez les variantes aux classes brutes border/shadow sur les surfaces gaming.

| `variant` | Quand l'utiliser |
|-----------|------------------|
| `default` | Surfaces génériques : lignes de classement, cartes de profil, panneaux admin |
| `neon` | Accents gaming — révélation de palier, panneaux de score, cartes d'onboarding |
| `success` | Résultat de bonne réponse, succès débloqué, retour positif |
| `warning` | Action disponible à durée limitée (rattrapages, fenêtre de jeu), avertissement non bloquant |
| `error` | Résultat de mauvaise réponse, série rompue, retour négatif |

```tsx
<Card variant={isCorrect ? 'success' : 'error'} className="p-6">…</Card>
<Card variant="neon" interactive>…</Card>
```

Pour ajouter une variante : mettre à jour `cardVariants` dans `src/components/ui/card.tsx`, documenter ici, et préférer la composition aux overrides inline.

### `Alert` (`@/components/ui/alert`)

| `variant` | Quand l'utiliser |
|-----------|------------------|
| `default` | Notices neutres génériques |
| `destructive` | Erreurs, confirmations d'actions destructrices |
| `warning` | Mise en garde, risque réversible |
| `success` | Confirmation positive |
| `info` | Encarts informationnels, prompts de tutoriel (accent neon-blue) |
| `neon` | Moments gaming — bannière risque de série, nudges limités (dégradé neon-pink/purple) |

Utilisez `AlertTitle` + `AlertDescription` pour la structure ; la bannière doit toujours afficher un titre visible pour l'accessibilité, même quand le titre porte le message principal.

### Toasts (`@/components/ui/sonner` + `@/lib/toast`)

Les toasts sont propulsés par `sonner`. Le `<Toaster />` thématisé est monté une seule fois dans `App.tsx`. Deux styles d'appel sont supportés :

1. **Toasts texte simples** via le shim `@/lib/toast` :
   ```ts
   import { toast } from '@/lib/toast'
   toast.success(t('admin.games.messages.saved'))
   ```
2. **Toasts riches custom** — utiliser `sonner.toast.custom((id) => <Body …/>)` directement. Voir `showAchievementToast` dans `@/components/achievement` pour l'exemple gaming canonique (Card + variante CVA + framer-motion).

L'ancien `ToastContainer` dans `@/components/ui/toast-container` a été supprimé. Ne pas réintroduire de système de toast parallèle — toutes les notifications passent par sonner pour rester pilotées par les tokens.
