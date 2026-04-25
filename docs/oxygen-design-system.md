# Oxygen Design System — Principles Reference

This document captures the principles of [Doctolib's Oxygen design system](https://oxygen.doctolib.design) and how we apply them to The Box.

> **Scope.** Oxygen is Doctolib's healthcare design system: light, blue, professional, WCAG-AA-first. The Box is a dark gaming product with a deliberately distinct visual identity (see `docs/ui-tokens.md`). We **do not** adopt Oxygen's visual language. We adopt its **principles**: accessibility-first, token discipline, action hierarchy, decision-tree-driven component choice, and documented exceptions.
>
> Tokens, palettes and shadcn/Radix variants remain governed by `docs/ui-tokens.md`. This document is the **principles** layer; `ui-tokens.md` is the **values** layer.

---

## 1. Sources

- Oxygen public site: <https://oxygen.doctolib.design>
- Oxygen Storybook: <https://doctolib.github.io/storybook/>
- Doctolib engineering on Medium:
  - "Design System: the art of documented compromise" — <https://medium.com/doctolib/design-system-the-art-of-documented-compromise-04a7a5fab937>
  - "How we organise our Design System libraries" — <https://medium.com/doctolib/how-we-organise-our-design-system-libraries-to-help-doctolib-designers-use-more-than-70-000-c15237c81f6c>
  - "The tortuous journey of enhancing our color palette" — <https://medium.com/doctolib/the-tortuous-journey-of-enhancing-our-color-palette-4616b5b9c43e>
- "Choosing form components" decision tree — <https://fountn.design/resource/doctolibs-oxygen-design-system-choosing-form-components/>
- "Choosing actions" decision tree — <https://fountn.design/resource/doctolib-design-system-choosing-actions/>

---

## 2. Core principles (and how we apply them)

### 2.1 Accessible by design

Oxygen's first principle: as healthcare software, accessibility is non-negotiable. The Box is a game, not a healthcare product, but we adopt the same posture — accessibility issues are **bugs**, not polish.

Concrete rules we follow:

- **Visible text labels are mandatory in forms.** Even when `aria-label` would technically satisfy WCAG, a visible `<Label htmlFor="…">` is required for every `<Input>`, `<Textarea>`, `<Select>`, and grouped `<RadioGroup>`/`<Checkbox>`. Search inputs that have a magnifying-glass icon and an `aria-label` are an allowed, **documented** exception (Oxygen calls this "documented compromise").
- **Icon-only interactive elements need an accessible name.** Any `<button>` or `<a>` whose only child is an `<Icon />` MUST have `aria-label="…"` (or a visually hidden `<span className="sr-only">`).
- **No color-only state signaling.** Errors, success, warnings must always pair color with an icon, label, or copy. Score tier colors (`text-score-*` from `ui-tokens.md`) must not be the only differentiator on metacritic chips, speed badges, etc.
- **`focus-visible` is mandatory.** If you set `focus:outline-none` you MUST replace it with a `focus-visible:ring-…` style (token-driven, see `--ring`). Never strip focus without a replacement.
- **Native semantics first.** Use `<button>` for actions, `<a href>` for navigation, `<nav>`, `<main>`, `<header>`, `<footer>`, `<section>` where applicable. Interactive `<div onClick>` is forbidden unless it carries `role`, `tabIndex` and keyboard handlers.
- **Heading order.** A page exposes one `<h1>` and headings descend without skipping (no jumping `h1 → h3`).
- **Images.** Every meaningful `<img>` has a non-empty `alt`; decorative images use `alt=""` (and are usually backgrounds anyway).
- **Reduced motion.** `index.css` already neutralises animation durations under `prefers-reduced-motion: reduce`. Do not add `!important` rules that override it.

### 2.2 Token-driven, never raw

Oxygen treats tokens as the only legitimate channel for design decisions. We already enforce this via `docs/ui-tokens.md` and the local ESLint rule `design-tokens/no-raw-design-tokens` (`packages/frontend/eslint-local/`). The Oxygen principle to remember:

> **A token is a design decision. A raw value is a leak.**

If you find yourself reaching for `#xxxxxx`, `rgba(…)`, `oklch(…)`, or a Tailwind palette utility (`bg-red-500`, `text-amber-400`, `from-green-500`), stop and add a token first. The same applies to inline `style={{ marginTop: '13px' }}` — use the spacing scale.

### 2.3 Action hierarchy

Oxygen's "Choosing actions" guide is built around a strict hierarchy:

| Level | When | The Box mapping |
|---|---|---|
| **Primary** | The single most important action in the current view | `<Button variant="default">` (violet primary) |
| **Secondary** | Important alternatives or co-actions | `<Button variant="secondary">` or `outline` |
| **Tertiary** | Low-priority, dismissible, ancillary actions | `<Button variant="ghost">` or `<Button variant="link">` |
| **Destructive** | Anything that deletes / cannot be undone | `<Button variant="destructive">` |

Rules:

- **One primary action per context.** A page, modal, card, or form must have at most one primary CTA. If you need two equally important actions, both should be secondary.
- **Same intent → same variant.** "Cancel" must look the same across all dialogs. "Save" must look the same across all admin forms.
- **Destructive is its own category.** Never style a destructive action as primary. Never put it on the same axis as the safe action without separation (modal footer rule: destructive on the left, safe on the right, or vice versa, but consistent).

### 2.4 Decision trees for component choice

Oxygen ships decision trees instead of catalogs. The two most-cited:

**Form component choice**

- 1 of N, ≤4 options, all visible at once → **RadioGroup**
- 1 of N, ≥5 options or limited space → **Select**
- M of N (multi-select) → **Checkbox group**
- Free-text short → **Input**
- Free-text long → **Textarea**
- Boolean toggle that has immediate effect → **Switch**
- Boolean toggle that is part of a form submitted later → **Checkbox**

**Action choice**

- Triggers an action on the current page / submits a form → **`<Button>`**
- Navigates to a different URL → **`<a>` / `<Link>`**
- Looks like a button but really navigates → **`<Button asChild><Link/></Button>`** (never style an `<a>` as a button manually)
- Iconic shortcut with no label → forbidden unless `aria-label` is provided

When in doubt: ask "is this an action or a navigation?" If you can't answer, you're picking the wrong component.

### 2.5 Documented compromise

Every design system has exceptions. Oxygen's rule: an exception that is documented is a feature; an exception that is not is a bug.

In The Box this means:

- Components in `src/components/backgrounds/` legitimately need raw hex colors (Three.js materials). The ESLint rule excludes them — that exclusion is the documentation.
- Search inputs without visible labels are allowed when (a) a magnifying-glass icon makes intent obvious, (b) `aria-label` is set, (c) the component is reused via a documented pattern.
- Any other deviation must be called out in the PR description with rationale.

### 2.6 Consistency over cleverness

Two equally valid solutions to the same problem are worse than one slightly-imperfect-but-shared solution. Before adding a new component, check whether a Radix/shadcn primitive in `src/components/ui/` already covers the case. Before adding a new variant, check whether existing variants in `Card`, `Alert`, `Button` already express the intent.

---

## 3. Principles → file map

| Principle | Where it's enforced or expressed |
|---|---|
| Token discipline | `docs/ui-tokens.md`, `packages/frontend/src/index.css`, `packages/frontend/eslint-local/no-raw-design-tokens.js` |
| Action hierarchy | `packages/frontend/src/components/ui/button.tsx` (`buttonVariants`) |
| Card hierarchy | `packages/frontend/src/components/ui/card.tsx` (CVA variants) |
| Alert hierarchy | `packages/frontend/src/components/ui/alert.tsx` |
| Toasts | `packages/frontend/src/components/ui/sonner.tsx`, `packages/frontend/src/lib/toast.ts` |
| Reduced motion | `packages/frontend/src/index.css` (`@media (prefers-reduced-motion: reduce)`) |
| Focus rings | `--ring` token, `focus-visible:ring-ring` utility |
| i18n | `packages/frontend/public/locales/{en,fr}/` |

---

## 4. Audit checklist

Use this list when reviewing a PR or auditing a page for Oxygen compliance.

**Accessibility**

- [ ] Every form input has a visible `<Label>` linked via `htmlFor` / `id`
- [ ] Every icon-only `<button>` / `<a>` has `aria-label` or `<span className="sr-only">`
- [ ] No `focus:outline-none` without a `focus-visible:` replacement
- [ ] No `<div onClick>` without `role`, `tabIndex`, and keyboard handler
- [ ] Headings descend in order; one `<h1>` per page
- [ ] All `<img>` have `alt` (empty for decorative)
- [ ] State is never communicated by color alone

**Tokens**

- [ ] No raw `#hex`, `rgb()`, `rgba()`, `oklch()`, `hsl()` in JSX (ESLint catches this; don't disable the rule)
- [ ] No Tailwind palette utilities (`bg-red-500`, etc.) outside the token layer
- [ ] No `style={{ … }}` for spacing/colors that could be utility classes

**Action hierarchy**

- [ ] At most one primary CTA per view / modal / form
- [ ] Cancel/Save labels and variants consistent across dialogs
- [ ] Destructive actions use `variant="destructive"` and are separated from safe actions
- [ ] Buttons that navigate use `<Button asChild><Link/></Button>`, not styled `<a>`s

**Component choice**

- [ ] Form pickers follow the decision tree in §2.4
- [ ] No new custom component when a `ui/*` primitive would do
- [ ] No new variant when an existing CVA variant matches the intent
