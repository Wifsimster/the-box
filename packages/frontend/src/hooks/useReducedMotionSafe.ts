import { useReducedMotion } from 'framer-motion'

/**
 * Reactive wrapper around framer-motion's `useReducedMotion()` — returns
 * `true` when the user has `prefers-reduced-motion: reduce`.
 *
 * It subscribes to the media query, so a user toggling the OS setting at
 * runtime sees the change without a reload.
 */
export function useReducedMotionSafe(): boolean {
  return useReducedMotion() ?? false
}
