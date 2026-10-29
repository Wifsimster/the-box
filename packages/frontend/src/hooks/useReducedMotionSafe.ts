import { useReducedMotion } from 'framer-motion'

export function useReducedMotionSafe(): boolean {
  return useReducedMotion() ?? false
}
