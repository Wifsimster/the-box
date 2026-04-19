# UI Token Contract

Authoritative reference for every design token in the frontend. Source of truth lives in `packages/frontend/src/index.css` under `:root` and `@theme inline`. If a value is not in this document, it should not appear in component code.

> **Rule of thumb:** colors, shadows, durations, easings, radii and font families must be consumed through tokens. Raw `#hex`, `rgb()`, `rgba()`, `oklch(...)`, or inline `boxShadow` values in components are forbidden unless added here first.

---

## Palette — surface & semantic

All shadcn `bg-*` / `text-*` / `border-*` utilities resolve through this layer.

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

## Palette — gaming neon

Use sparingly and semantically. These are brand-flavor accents, not general-purpose colors.

| Token | Value | Tailwind class | When to use |
|---|---|---|---|
| Neon Purple | `--neon-purple` = `#a855f7` | `text-neon-purple` / `bg-neon-purple` | Primary gaming accent, tier reveals, scoring highlights |
| Neon Pink | `--neon-pink` = `#ec4899` | `text-neon-pink` / `bg-neon-pink` | Paired with purple in gradients; alt primary accent |
| Neon Blue | `--neon-blue` = `#3b82f6` | `text-neon-blue` / `bg-neon-blue` | Informational, hints, tutorial callouts |
| Neon Cyan | `--neon-cyan` = `#06b6d4` | `text-neon-cyan` / `bg-neon-cyan` | Cold-tone accents, stats, counters |

**Allowed gradient combos:**

- `bg-gradient-to-r from-neon-purple to-neon-pink` — hero CTA, tier reveal banner
- `bg-gradient-to-br from-neon-purple/20 to-neon-pink/20` — subtle surface highlight
- `bg-gradient-to-r from-neon-blue to-neon-cyan` — info / stats chips

Any other neon gradient must be proposed and added to this section before shipping.

## Palette — status

For badges, toasts, banners, achievement states.

| Token | Value | Tailwind class |
|---|---|---|
| Success | `--success` = `#22c55e` | `text-success` / `bg-success` |
| Warning | `--warning` = `#eab308` | `text-warning` / `bg-warning` |
| Error | `--error` = `#ef4444` | `text-error` / `bg-error` |

Prefer `bg-destructive` over `bg-error` for shadcn component states that already use the destructive channel (form errors, delete confirmations). `bg-error` is reserved for custom gaming surfaces (failed guess, streak broken).

## Palette — chart

Exposed for potential future dashboards; not for UI chrome.

| Token | Usage |
|---|---|
| `--chart-1`…`--chart-5` | Charts, graphs, visualizations only |

---

## Shadows & glow

All box-shadow values in components must reference one of these tokens.

| Token | Value | Intended use |
|---|---|---|
| `--glow-sm` | `0 0 10px oklch(0.7 0.25 300 / 0.3)` | Subtle focus / hover on list items |
| `--glow-md` | `0 0 20px oklch(0.7 0.25 300 / 0.4)` | Default hover on interactive cards, primary CTAs |
| `--glow-lg` | `0 0 30px oklch(0.7 0.25 300 / 0.5)` | Tier reveal, score reveal, hero moments only |
| `--glow-success` | `0 0 20px oklch(0.75 0.2 145 / 0.5)` | Correct-guess pulse, success input state |
| `--glow-error` | `0 0 20px oklch(0.7 0.22 25 / 0.5)` | Wrong-guess shake, error input state |
| `--text-shadow-neon` | stacked neon text shadow | Hero titles (TierIntro, landing heroes) |

**Utility classes already wired:**

- `.glow-purple` / `.glow-pink` / `.glow-blue` — legacy fixed-hue glows. **Deprecated** in favor of `--glow-*` tokens; do not use in new code.
- `.text-glow` — text shadow at `currentColor`. Fine to use.
- `.text-shadow-neon` — stacked neon text shadow for hero titles.
- `.glow-hover` — animates to `--glow-md` on hover, respects `--ease-smooth`.
- `.card-interactive` — full interactive-card treatment (border + glow transition).
- `.bg-grid-neon` — 50×50 neon grid backdrop for hero screens.

**Shadow anti-patterns to fix during migration:**

- Inline `box-shadow: 0 0 20px rgba(168, 85, 247, 0.3)` → replace with `className="glow-hover"` or inline `style={{ boxShadow: 'var(--glow-md)' }}`.
- Inline `boxShadow: '0 0 20px oklch(...)'` in JSX → replace with `var(--glow-sm|md|lg)`.

## Radii

| Token | Value | Tailwind class |
|---|---|---|
| `--radius-sm` | `calc(--radius - 4px)` → `0.25rem` | `rounded-sm` |
| `--radius-md` | `calc(--radius - 2px)` → `0.375rem` | `rounded-md` |
| `--radius-lg` | `--radius` → `0.625rem` | `rounded-lg` |
| `--radius-xl` | `calc(--radius + 4px)` → `0.875rem` | `rounded-xl` |

Avoid arbitrary `rounded-[12px]` unless there is a clear design rationale captured in the PR description.

## Typography

| Token | Value | Tailwind class |
|---|---|---|
| `--font-sans` | `'Inter', system-ui, -apple-system, sans-serif` | `font-sans` (default) |
| `--font-mono` | `'JetBrains Mono', monospace` | `font-mono` |

No other font stacks are permitted. Weight/size scales follow Tailwind defaults.

## Motion — duration & easing

| Token | Value | When to use |
|---|---|---|
| `--duration-fast` | `150ms` | Hover color flips, tooltip fade, button press |
| `--duration-normal` | `300ms` | Card hover, modal open, tab swap |
| `--duration-slow` | `500ms` | Tier reveal, score count-up, large transitions |
| `--ease-smooth` | `cubic-bezier(0.4, 0, 0.2, 1)` | Default for all transitions |
| `--ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | Entry animations (fade-in, slide-in) |
| `--ease-bounce` | `cubic-bezier(0.68, -0.55, 0.265, 1.55)` | Achievement unlock, reward reveal only |

**Framer Motion:** prefer these values over hardcoded `duration: 0.3` literals. Example:

```tsx
transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }} // ← ease-smooth
```

Respect `@media (prefers-reduced-motion: reduce)` — `index.css` already neutralises durations globally for motion-sensitive users. Do not introduce new `!important` animation rules that bypass it.

---

## Consumption rules

### ✅ Do

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

### ❌ Don't

```tsx
<div style={{ boxShadow: '0 0 20px rgba(168, 85, 247, 0.3)' }} />
<div className="bg-[#a855f7]" />
<div className="shadow-[0_0_20px_oklch(0.7_0.25_300)]" />
<div style={{ background: 'linear-gradient(to right, #a855f7, #ec4899)' }} />
```

---

## Governance

1. **No raw colors or shadows in components.** Anything not listed here requires a token addition + PR review.
2. **Radix/shadcn primitives first.** New custom components must compose `@/components/ui/*` unless they add genuinely new domain semantics.
3. **CVA variants, not new components.** Gaming aesthetics on top of shadcn primitives are expressed via `class-variance-authority` variants, not by forking the primitive.
4. **Migrations go through the token layer.** When replacing custom components, fold any one-off colors/shadows into a token and deprecate the raw value.

A future lint rule (planned in Sprint 4 of the shadcn migration roadmap) will enforce rules 1 and 2 at CI time via `eslint-plugin-tailwindcss` + a regex check banning raw `rgba(`, `oklch(`, and Tailwind arbitrary values for `bg-[`, `text-[`, `shadow-[` in `src/components/**`. Arbitrary values referencing a CSS variable (`shadow-[var(--glow-md)]`) remain allowed — they are token-driven.

---

## Primitive variants

### `Card` (`@/components/ui/card`)

Powered by `class-variance-authority`. Prefer variants over raw border/shadow classes in gaming surfaces.

| `variant` | When to use |
|---|---|
| `default` (default) | Generic surfaces: leaderboard rows, profile cards, admin panels |
| `neon` | Gaming accents — tier reveals, score panels, onboarding cards |
| `success` | Correct-guess result, achievement unlocked, positive outcomes |
| `error` | Wrong-guess result, streak broken, negative outcomes |

```tsx
<Card variant={isCorrect ? 'success' : 'error'} className="p-6">…</Card>
<Card variant="neon" interactive>…</Card>
```

Adding new variants: update `cardVariants` in `src/components/ui/card.tsx`, document here, and prefer composition over inline overrides in consumers.

### `Alert` (`@/components/ui/alert`)

| `variant` | When to use |
|---|---|
| `default` (default) | Generic neutral notices |
| `destructive` | Errors, destructive action confirmations |
| `warning` | Caution, reversible risk |
| `success` | Positive confirmation |
| `info` | Informational callouts, tutorial prompts (neon-blue accent) |
| `neon` | Gaming hype moments — streak-risk banner, limited-time nudges (neon-pink/purple gradient) |

Use `AlertTitle` + `AlertDescription` for structure; the banner must still render a visible title for a11y even when the title doubles as the main copy.
