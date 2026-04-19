# Mobile-First Experience — Subagents Meeting

**Date:** 2026-04-19
**Attendees:** UX Designer (agent), Architect (agent), Product/A11y (agent), Facilitator (Claude)
**Topic:** Audit of "The Box" mobile-first experience and prioritized action plan.

---

## Executive Summary

The Box has solid mobile foundations — mobile-first Tailwind breakpoints, a sophisticated `useKeyboardHeight` hook on the game page, `touch-manipulation` classes, lazy-loaded routes, and a hamburger Sheet nav. But it ships as a playable-on-mobile web app rather than a true mobile-first experience. The biggest gaps are: no safe-area insets, `100vh` instead of `dvh`, desktop-size panorama images on phones, broken landscape mode, a leaderboard table that collapses at 375 px, and sub-44 px tap targets on hint/progress controls.

Three priorities for the next sprint:
1. **Viewport correctness** — safe-area insets + `dvh` + keyboard-aware forms.
2. **Image & bundle diet** — responsive images, image-memory eviction, defer Three.js off critical paths.
3. **Touch & flow polish** — tap targets ≥ 44 px, landscape support, leaderboard card stack, hint labels.

---

## 1. UX Designer — Responsive Patterns & Interaction

### Strengths
- Keyboard-aware game layout via `useKeyboardHeight` + `visualViewport` API (`packages/frontend/src/hooks/useKeyboardHeight.ts:24`, applied in `GamePage.tsx:609-631`).
- Mobile-first Tailwind patterns throughout GamePage (e.g., `h-8 px-2` → `sm:h-9 sm:px-3 md:px-6` at `GamePage.tsx:490-640`).
- Touch-optimized controls with `touch-manipulation` and haptic feedback in `components/ui/game-carousel.tsx:79-83`.
- Dual-surface nav: Sheet hamburger on `md:hidden` plus an in-game top-left menu (`GamePage.tsx:492-563`).
- Scrolling locked during gameplay via `fixed inset-0 overflow-hidden` to stabilize the panorama viewport.

### Gaps
- **No safe-area insets.** Hardcoded `top-1 left-2`, `h-14 sm:h-16` — collides with iPhone notch/Dynamic Island and Android gesture bars. Missing `viewport-fit=cover` meta.
- **`100vh` everywhere.** Breaks when mobile chrome animates; should be `dvh` (or JS fallback) on ResetPassword/Results/auth pages.
- **Touch targets below iOS 44 pt** on some hint badges and previous/skip buttons.
- **No landscape styles.** Zero `landscape:` Tailwind usage; hints stack vertically and waste height in landscape.
- **Auth forms lack keyboard awareness.** Login/Register/ResetPassword don't reuse the keyboard pattern from GamePage.
- **Carousel swipe affordance hidden.** Users don't know the panorama is swipeable.

---

## 2. Architect — Performance, Bundle & Realtime

### Current state
- Route-level `React.lazy` on all 14+ pages in `App.tsx:19-35`.
- Three.js + R3F used only for decorative `CubeBackground` (600-particle dust) but imported globally via the layout wrapper.
- Image prefetch logic in `GamePage.tsx:97-120, 239-306` and `ScreenshotViewer.tsx:65-103` — no eviction.
- Socket.IO reconnection configured (`socket.ts:22-26`), but no visibility-change pause.
- No PWA: no `manifest.json`, no service worker, no offline cache.
- Screenshots served at a single resolution — no `srcset`/`<picture>`/DPR handling.

### Risks
- Three.js + 600 particles run on every page that uses the background — ~150-200 KB JS cost on the sign-in / game-entry path, plus jank on low-end Android.
- Pre-fetched full-size panoramas accumulate in memory across rounds with no cleanup.
- Mobile users download desktop-resolution screenshots.
- Socket.IO keeps retrying while the tab is backgrounded — battery + data drain on flaky 3G/4G.
- Large Radix + framer-motion surface area loaded upfront; modals/dropdowns used rarely.
- No WebGL fallback path in `CubeBackground.tsx:138-145`.

### Recommendations
1. Move `CubeBackground` out of the global layout; render it only on routes that need it, lazy-loaded.
2. Add responsive image delivery (server resize endpoint or CDN) with `srcset` at 480/800/1200 px; evict prefetched images after each round.
3. Add a `visibilitychange` listener that pauses/resumes the Socket.IO client; add `manualChunks` in `vite.config.ts` to split Radix primitives.

---

## 3. Product & A11y — Flows, Tap Targets, Readability

### Critical bugs
- **Hint badge tap targets too small** (`components/game/HintButtons.tsx:107-120`) — `h-4 text-[10px]` at `-top-1.5 -right-1.5`, well under WCAG 2.5.5 44×44.
- **Progress dots dense at 375 px** (`components/game/ProgressDots.tsx:51`) — `w-6 h-6` with tight gap causes mis-taps on a 10-item carousel.
- **Panorama assumes portrait** (`components/game/ScreenshotViewer.tsx:114`) — `min-h-[60vh]` hardcoded, letterboxes badly in landscape.
- **Leaderboard row doesn't stack at 375 px** (`pages/LeaderboardPage.tsx:310-346`) — avatar + rank + handle + score collide; needs card fallback.
- **`text-[10px]` score label** (`components/game/ScoreDisplay.tsx:9`) — unreadable and fails contrast on light backgrounds.

### Polish
- Daily reward modal can overflow iPhone SE viewport (`components/daily-login/DailyRewardModal.tsx:54`).
- Hint buttons lack text labels on mobile; tooltips are hover-only.
- Guess input loses width to padding + inline submit at 375 px.
- Admin panel tabs (`text-[10px] h-7`) are unusable on phones — expected but friendly fallback missing.
- French strings (e.g., "Indice d'année") need width that desktop-sized widgets assume.

---

## Prioritized Action Plan

### P0 — Viewport correctness (next sprint)
- [ ] Add `<meta name="viewport" content="viewport-fit=cover">`.
- [ ] Replace `100vh`/`min-h-screen` with `dvh` where layout depends on viewport height.
- [ ] Safe-area padding utilities on Header + GamePage edge UI (`env(safe-area-inset-*)`).
- [ ] Extract keyboard-awareness pattern from GamePage into `useViewportWithKeyboard()` and apply to Login / Register / ResetPassword.

### P1 — Touch & flow polish
- [ ] Progress dots: `w-6 h-6` → `w-8 h-8` mobile, `sm:w-6 sm:h-6` desktop; raise gap to `gap-2`.
- [ ] Hint badges: increase to `h-5`, add visible labels on mobile or at least a tap-hint state.
- [ ] Landscape support on ScreenshotViewer: `@media (orientation: landscape)` override for `min-h`.
- [ ] Leaderboard row: stack to card layout under `sm:`; secondary line for `@username`.
- [ ] Raise `ScoreDisplay` label to `text-xs` minimum.

### P2 — Performance & bundle
- [ ] Lazy-load `CubeBackground` per route; drop from layout wrapper.
- [ ] Responsive screenshots (`srcset` 480/800/1200) + memory eviction after round completion.
- [ ] Pause Socket.IO reconnection on `visibilitychange` hidden.
- [ ] Split Radix/framer-motion into async chunks via `manualChunks`.

### P3 — Progressive enhancement
- [ ] PWA manifest + service-worker for daily-challenge offline-replay + install-to-home-screen.
- [ ] Landscape-optimized hint bar.
- [ ] First-run swipe affordance on the panorama viewer.

---

## Open Questions for Product
1. Is PWA/installable a goal, or should mobile remain strictly browser-first?
2. Is the admin panel on mobile officially out of scope, or do we want a minimal viable layout?
3. Do we have device-lab access (Pixel 4a, iPhone SE, iPhone 14+ Pro) for regression testing, or is BrowserStack sufficient?
4. Are the panorama screenshots stored in a form we can resize server-side, or do we need a pre-process step?

---

## Suggested E2E Coverage Additions
- `mobile.spec.ts` — Playwright project with iPhone 12 + Pixel 5 viewports covering: daily-challenge flow, leaderboard at 375 px, landscape rotation mid-game, auth form with virtual keyboard open.
