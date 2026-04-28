# Design System — Discord-Inspired Rules

This document defines the design language used across **The Box**. It is heavily
inspired by Discord's public design guidelines (Branding site, Discord Design
blog, the 2021 "Building a Stronger Discord" redesign) and adapted to the
existing dark-violet gaming theme already wired up in
`packages/frontend/src/index.css` and documented in `docs/ui-tokens.md`.

The goal is consistency: every contributor — human or agent — should be able
to build a new screen without having to invent colors, spacing, or motion
values.

---

## 1. Design Principles

Adapted from Discord's published philosophy:

1. **Playful, not childish.** Gaming energy through neon accents, gradients,
   and motion — but layouts stay calm and readable. Decoration never beats
   legibility.
2. **Accessible by default.** WCAG AA contrast (4.5:1 for body text, 3:1 for
   large text). Visible focus rings on every interactive element. Reduced
   motion respected.
3. **Dark-first.** The product is a single dark theme. Don't design "light mode"
   variants — there is no light mode.
4. **Familiar.** Reuse Radix/shadcn primitives (`packages/frontend/src/components/ui/`)
   instead of recreating buttons, dialogs, or inputs.
5. **Consistent rhythm.** Spacing, radius, and motion all draw from a small
   token set. New magic numbers are a code smell.
6. **One source of truth.** Tokens live in `index.css` (`:root` + `@theme inline`).
   Never hardcode hex/oklch colors in components.

---

## 2. Brand Identity

### Logo & wordmark

- The product wordmark uses the `gradient-gaming-title` utility (purple →
  pink → cyan gradient text). See `index.css` line 235.
- Maintain breathing room around the wordmark equal to the cap-height of
  the type.
- Never recolor the gradient stops per page — they are global identity.

### Voice

- **French is primary**, English secondary. All copy goes through `i18next`
  (`public/locales/{fr,en}/`). No hardcoded strings.
- Tone: encouraging, direct, gamer-aware. Avoid corporate phrasing.
- Use sentence case for buttons and headers; reserve UPPERCASE for tier
  badges and short numeric callouts.

---

## 3. Color System

All color tokens are defined in `packages/frontend/src/index.css` under
`:root` and re-exported through `@theme inline` so Tailwind utilities like
`bg-primary`, `text-muted-foreground`, `border-border` resolve correctly.

### Semantic tokens (use these in components)

| Token | Tailwind class | Purpose |
|---|---|---|
| `--background` | `bg-background` | Page background |
| `--foreground` | `text-foreground` | Default body text |
| `--card` | `bg-card` | Surface for cards/panels |
| `--card-foreground` | `text-card-foreground` | Text on cards |
| `--popover` | `bg-popover` | Floating surfaces (menus, tooltips) |
| `--primary` | `bg-primary` | Primary actions, brand accents |
| `--primary-foreground` | `text-primary-foreground` | Text on primary |
| `--secondary` | `bg-secondary` | Secondary actions |
| `--muted` | `bg-muted` | Subtle surfaces, disabled states |
| `--muted-foreground` | `text-muted-foreground` | Helper text, captions |
| `--accent` | `bg-accent` | Hover/selected states |
| `--destructive` | `bg-destructive` | Delete, error actions |
| `--border` | `border-border` | All borders/dividers |
| `--input` | — | Form field background |
| `--ring` | `ring-ring` | Focus indicator |

### Brand neon palette

Use sparingly — for hero titles, decorative glows, gradient surfaces.

| Token | Value | Usage |
|---|---|---|
| `--neon-purple` | `#a855f7` | Primary brand neon |
| `--neon-pink` | `#f472b6` | Secondary brand neon (AA-bumped) |
| `--neon-blue` | `#3b82f6` | Tertiary accent |
| `--neon-cyan` | `#06b6d4` | Gradient terminator |

**Rule:** Neon colors never carry meaning (success/error). They are decorative.
Use status tokens for semantic feedback.

### Status & feedback

| Token | Value | Usage |
|---|---|---|
| `--success` | `#22c55e` | Correct guesses, completed achievements |
| `--warning` | `#eab308` | Time running out, warnings |
| `--error` | `#ef4444` | Validation errors, failures |
| `--score-high` | `var(--success)` | Excellent score tier |
| `--score-mid` | `var(--warning)` | Fair score tier |
| `--score-low` | `#f97316` | Low score tier |
| `--medal-gold` | `#fbbf24` | Leaderboard 1st place |
| `--medal-silver` | `#94a3b8` | Leaderboard 2nd place |
| `--medal-bronze` | `#b45309` | Leaderboard 3rd place |

**Rule:** Score tiers are a quality scale (high > mid > low). Medals are
categorical. Don't swap them.

### Contrast rules (Discord parity)

- Body text on any surface must clear **4.5:1**.
- Large text (≥18px regular / ≥14px bold) must clear **3:1**.
- Decorative neon-on-dark text: bump to the AA-corrected variant
  (`--neon-pink` is `#f472b6`, not `#ec4899`).
- Verify with a contrast checker before merging — don't eyeball it.

---

## 4. Typography

### Font stack

Defined in `index.css`:

```css
--font-sans: 'Inter', system-ui, -apple-system, sans-serif;
--font-mono: 'JetBrains Mono', monospace;
```

Discord uses `gg sans`. We use Inter — the closest open alternative with
similar geometric humanist proportions. Don't introduce additional font
families.

### Scale (Tailwind defaults)

| Role | Class | Use |
|---|---|---|
| Display | `text-5xl`/`text-6xl` + `gradient-gaming-title` | Page hero titles |
| H1 | `text-4xl font-bold` | Page titles |
| H2 | `text-2xl font-semibold` | Section headers |
| H3 | `text-xl font-semibold` | Card titles |
| Body | `text-base` | Default paragraph |
| Small | `text-sm text-muted-foreground` | Helper, captions |
| Mono | `font-mono` | Counters, codes, IDs |

### Rules

- Never apply a custom `font-family` in component styles.
- Never use `font-weight` < 400 for body copy.
- Hero titles use `gradient-gaming-title`; never duplicate the gradient
  inline.
- Numeric displays (timer, score) use `font-mono` for tabular alignment.

---

## 5. Spacing & Layout

### Spacing scale

Tailwind's default 4px-based scale (`p-1` = 4px, `p-4` = 16px, `p-8` = 32px).
Discord uses an 8pt grid; we follow the same multiples (4, 8, 12, 16, 24, 32, 48, 64).

**Rule:** No arbitrary values like `p-[13px]`. If you reach for a bracket,
something is off.

### Container widths

- Page max width: `max-w-7xl` (1280px) for content shells.
- Reading column: `max-w-prose` for long-form (legal, docs).
- Cards: hug their content; don't force fixed widths.

### Radius tokens

```css
--radius: 0.625rem;            /* 10px — base */
--radius-sm: calc(var(--radius) - 4px);  /* 6px  */
--radius-md: calc(var(--radius) - 2px);  /* 8px  */
--radius-lg: var(--radius);              /* 10px */
--radius-xl: calc(var(--radius) + 4px);  /* 14px */
```

| Token | Used by |
|---|---|
| `rounded-sm` | Tags, badges, focus outlines |
| `rounded-md` | Inputs, small buttons |
| `rounded-lg` | Cards, modals, default buttons |
| `rounded-xl` | Hero panels, screenshot frames |
| `rounded-full` | Avatars, pill counters |

---

## 6. Elevation & Glow

Discord uses subtle elevation and Blurple glow on hover. We do the same with
neon-purple.

### Tokens

```css
--shadow-lift: 0 10px 30px oklch(0 0 0 / 0.3);
--glow-sm: 0 0 10px oklch(0.7 0.25 300 / 0.3);
--glow-md: 0 0 20px oklch(0.7 0.25 300 / 0.4);
--glow-lg: 0 0 30px oklch(0.7 0.25 300 / 0.5);
--glow-success / --glow-warning / --glow-error
```

### Utilities

- `.glow-sm` / `.glow-md` / `.glow-lg` — apply directly to a surface
- `.glow-hover` — animates `box-shadow` on hover
- `.card-interactive` — full hover treatment (border + glow + transition)
- `.text-shadow-neon` — for hero titles only

**Rule:** Don't write inline `style={{ boxShadow: ... }}`. Use the utility
or extend `index.css`.

---

## 7. Motion

### Tokens

```css
--duration-fast: 150ms;
--duration-normal: 300ms;
--duration-slow: 500ms;
--ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
--ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
```

### Rules

- Hover/focus transitions: `--duration-fast` + `--ease-smooth`.
- Modal/dialog enter/exit: `--duration-normal` + `--ease-out`.
- Celebratory feedback (achievement unlock, daily reward): `--ease-bounce`,
  used sparingly.
- All Framer Motion presets live in
  `packages/frontend/src/lib/animations.ts`. Reuse, don't recreate.
- **Reduced motion:** the global rule in `index.css` lines 302–317 already
  short-circuits animations for `prefers-reduced-motion`. Don't bypass it.

---

## 8. Components

We use Radix primitives wrapped by shadcn under
`packages/frontend/src/components/ui/`. **Always reach for these first.**

### Buttons

Variants live in the `Button` component (CVA). Discord-style hierarchy:

| Variant | When |
|---|---|
| `default` (primary) | Primary action on a screen — one per view |
| `secondary` | Alternative action |
| `outline` | Tertiary, low-emphasis |
| `ghost` | Toolbar/icon actions |
| `destructive` | Delete, irreversible |
| `gaming` | Hero CTAs (gradient + glow). Use sparingly. |
| `link` | Inline navigation only |

Sizes: `sm`, `default`, `lg`, `icon`. Don't introduce custom sizes.

### Inputs & forms

- Always paired with React Hook Form + Zod.
- Error text uses `text-destructive` and is associated with the input via
  `aria-describedby`.
- Required fields: visible label + `required` attribute. No asterisk-only
  indicators.

### Cards

- Default: `bg-card text-card-foreground border border-border rounded-lg p-6`.
- Interactive (clickable): add `card-interactive` utility for hover/focus
  treatment.
- Don't nest cards more than one level deep.

### Modals & dialogs

- Use Radix Dialog through the `ui/dialog.tsx` wrapper.
- Backdrop: `bg-background/80 backdrop-blur-sm`.
- Always have a visible close affordance + ESC support (Radix gives this
  for free).
- Trap focus and restore on close (Radix default — don't override).

### Toasts / notifications

- Achievement unlocks and daily login rewards use the bespoke components
  in `components/achievement/` and `components/daily-login/`.
- One toast at a time for system messages; queue further ones.

### Tables

- Admin tables use `--table-row-hover` for the row hover state.
- Sticky headers required when the body scrolls.

---

## 9. Iconography

- **Library:** Lucide (`lucide-react`). One library, no exceptions.
- **Sizing:** match the surrounding text size. `size={16}` for `text-sm`,
  `size={20}` for `text-base`, `size={24}` for `text-lg`+.
- **Stroke width:** Lucide default (1.5). Don't customize per-icon.
- **Decorative icons:** must have `aria-hidden="true"`.
- **Meaningful icons:** must have an accessible label (`aria-label` or
  visible text).

---

## 10. Imagery & Screenshots

- Game screenshots are served from `/uploads/`. Always use `<img>` with a
  meaningful `alt` (game title or "Screenshot of [game]").
- The `ScreenshotViewer` (Embla Carousel) preloads prev/next — don't add
  ad-hoc preloading.
- Decorative 3D (`CubeBackground`, Three.js) only on the home page. Never
  add another R3F scene without explicit design approval.

---

## 11. Real-time Feedback

For live leaderboard updates and game state (Socket.io, see
`docs/realtime.md`):

- New entries fade in over `--duration-normal`.
- Position changes use a brief glow flash, not a layout snap.
- Never block the UI on socket reconnects — show a subtle indicator only.

---

## 12. Accessibility Checklist

Required for every PR that touches UI:

- [ ] Body text contrast ≥ 4.5:1, large text ≥ 3:1.
- [ ] All interactive elements reachable by keyboard.
- [ ] Visible focus indicator (default `:focus-visible` in `index.css` is
      enough; only override if you provide an equivalent).
- [ ] Form inputs have associated `<label>` (or `aria-label`).
- [ ] Icon-only buttons have `aria-label`.
- [ ] Dialogs trap focus and restore on close.
- [ ] Animations honor `prefers-reduced-motion`.
- [ ] Color is never the sole indicator of state — pair with icon or text.
- [ ] `forced-colors` mode tested (`gradient-gaming-title` already falls
      back; check new gradient surfaces).

---

## 13. Anti-patterns

Things that fail review:

- Hardcoded hex/oklch in components instead of tokens.
- Inline `style={{ ... }}` for color, spacing, or shadow when a utility exists.
- Custom `font-family` per component.
- New magic numbers (`p-[13px]`, `mt-[7px]`).
- Building a button/input/dialog instead of using `components/ui/`.
- Hover state without a focus equivalent.
- Animations that don't respect reduced motion.
- Light-mode color overrides — there is no light mode.
- Recreating the gradient stack inline.
- Mixing icon libraries.

---

## 14. References

Public sources this document draws from:

- Discord Branding site (`discord.com/branding`) — logo rules, Blurple
  palette, tone.
- Discord Design Blog (`discord.com/category/design`) — system thinking,
  redesign rationale.
- "Building a Stronger Discord" (2021) — typography (gg sans), Blurple
  accessibility update.
- WCAG 2.1 AA — contrast and motion rules.

Internal docs:

- `docs/ui-tokens.md` — token reference.
- `docs/oxygen-design-system.md` — earlier design notes.
- `docs/realtime.md` — Socket.io event design.
- `packages/frontend/src/index.css` — the actual source of truth for tokens.

---

## 15. Updating this document

When you change a token, component contract, or spacing rule:

1. Edit `index.css` (tokens) or the relevant `components/ui/*` primitive.
2. Update the matching section here in the same PR.
3. Mention the change in the PR description so reviewers can sanity-check
   visual regressions.

A design system that drifts from the code is worse than no design system —
keep them in sync.
