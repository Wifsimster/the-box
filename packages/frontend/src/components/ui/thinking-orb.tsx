import { ThinkingOrb as BaseThinkingOrb } from 'thinking-orbs'
import type { ThinkingOrbProps } from 'thinking-orbs'

export type { OrbState, OrbSize } from 'thinking-orbs'

/**
 * Thin wrapper around `thinking-orbs`' <ThinkingOrb> — Jakub Antalik's dotted
 * thought-orb loaders (https://orbs.jakubantalik.com). It exists to pin the
 * theme once, app-wide.
 *
 * The Box is dark-only (`color-scheme: dark` in index.css) and its
 * `data-theme` attribute carries *accent* names (`neon_pink`, `cyber_blue`…),
 * not `dark`/`light`. The library's default `theme="auto"` therefore never
 * matches a dark/light ancestor and falls through to `prefers-color-scheme`,
 * which would paint dark (invisible) ink on our dark surfaces for anyone whose
 * OS is in light mode. Pinning `dark` keeps the light-ink orb visible
 * everywhere. Callers can still override `theme` for a light surface.
 *
 * Reduced-motion, offscreen/hidden-tab pausing and DPR capping are handled by
 * the library itself, so there is nothing to add here.
 */
export function ThinkingOrb({ theme = 'dark', ...props }: ThinkingOrbProps) {
  return <BaseThinkingOrb theme={theme} {...props} />
}
