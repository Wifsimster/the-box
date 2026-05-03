import { useReducedMotion } from 'framer-motion'
import type { MotionProps, Transition } from 'framer-motion'

/**
 * Reactive wrapper around framer-motion's `useReducedMotion()` — returns
 * `true` when the user has `prefers-reduced-motion: reduce`.
 *
 * Prefer this over the static `prefersReducedMotion()` helper in
 * `lib/animations`: this hook subscribes to the media query, so a user
 * toggling the OS setting at runtime sees the change without reload.
 *
 * Pair with {@link motionSafeProps} when feeding props into a
 * `<motion.*>` element so framer-motion-driven animations honour the
 * preference (the global CSS reset only neutralizes CSS animations).
 */
export function useReducedMotionSafe(): boolean {
  return useReducedMotion() ?? false
}

/**
 * Strip animation from a framer-motion props bag when the user prefers
 * reduced motion: the element snaps to its `animate` state with zero
 * `transition` and no `initial` keyframe.
 *
 * Stagger delays passed in `transition.delay` are zeroed too — a common
 * source of "I disabled motion but I still see a wave" reports.
 *
 * Use as `<motion.div {...motionSafeProps(rm, { initial: ..., animate: ..., transition: ... })} />`.
 */
export function motionSafeProps<P extends MotionProps>(
  reducedMotion: boolean,
  props: P
): P {
  if (!reducedMotion) return props
  const flat: Transition = { duration: 0, delay: 0 }
  return {
    ...props,
    initial: false,
    transition: flat,
  }
}
