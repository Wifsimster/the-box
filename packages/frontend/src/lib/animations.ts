import type { Variants, Transition } from 'framer-motion'

/**
 * Centralized animation configurations for Framer Motion
 * Provides reusable variants and transitions for consistent animations
 */

// ============================================================================
// Spring Configurations
// ============================================================================

export const springConfig = {
  gentle: { type: 'spring', stiffness: 120, damping: 14 } as Transition,
  snappy: { type: 'spring', stiffness: 400, damping: 17 } as Transition,
  bouncy: { type: 'spring', stiffness: 300, damping: 10 } as Transition,
}

// ============================================================================
// Directional Fade Animations
// ============================================================================

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
}

export const fadeInUp: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
}

export const fadeInDown: Variants = {
  initial: { opacity: 0, y: -20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 10 },
}

export const fadeInLeft: Variants = {
  initial: { opacity: 0, x: -20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 20 },
}

export const fadeInRight: Variants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
}

// ============================================================================
// Scale Animations
// ============================================================================

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.9 },
}

// ============================================================================
// Stagger Containers
// ============================================================================

export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
}

export const staggerContainerFast: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.03,
      delayChildren: 0.05,
    },
  },
}

// ============================================================================
// List and Table Animations
// ============================================================================

export const listItem: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: springConfig.gentle,
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: { duration: 0.2 },
  },
}

export const tableRow: Variants = {
  initial: { opacity: 0, x: -20 },
  animate: {
    opacity: 1,
    x: 0,
    transition: springConfig.gentle,
  },
  exit: {
    opacity: 0,
    x: 20,
    transition: { duration: 0.15 },
  },
}

// ============================================================================
// Interactive Animations (Hover/Tap)
// ============================================================================

export const hoverScale = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.98 },
  transition: springConfig.snappy,
}

export const hoverScaleSmall = {
  whileHover: { scale: 1.01 },
  whileTap: { scale: 0.99 },
  transition: springConfig.snappy,
}

export const hoverGlow = {
  whileHover: {
    boxShadow: '0 0 25px oklch(0.7 0.25 300 / 0.3)',
    borderColor: 'oklch(0.7 0.25 300 / 0.5)',
  },
  transition: { duration: 0.2 },
}

export const hoverLift = {
  whileHover: {
    y: -2,
    boxShadow: '0 10px 30px oklch(0 0 0 / 0.3)',
  },
  transition: springConfig.gentle,
}

// ============================================================================
// Page and Tab Transitions
// ============================================================================

export const pageTransition: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: 'easeOut' },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: { duration: 0.2 },
  },
}

export const tabContent: Variants = {
  initial: { opacity: 0, x: 20 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.2, ease: 'easeOut' },
  },
  exit: {
    opacity: 0,
    x: -20,
    transition: { duration: 0.15 },
  },
}

// ============================================================================
// Continuous Animations
// ============================================================================

export const pulse: Variants = {
  animate: {
    scale: [1, 1.05, 1],
    opacity: [1, 0.8, 1],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
}

export const glowPulse: Variants = {
  animate: {
    boxShadow: [
      '0 0 20px oklch(0.7 0.25 300 / 0.3)',
      '0 0 30px oklch(0.7 0.25 300 / 0.5)',
      '0 0 20px oklch(0.7 0.25 300 / 0.3)',
    ],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
}

// ============================================================================
// Accessibility Utilities
// ============================================================================

/**
 * Check if user prefers reduced motion
 * @returns true if user has enabled reduced motion preference
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Get transition based on reduced motion preference
 * @param transition - The transition configuration
 * @returns The transition with duration 0 if reduced motion is preferred
 */
export function getTransition(transition: Transition): Transition {
  if (prefersReducedMotion()) {
    return { duration: 0 }
  }
  return transition
}
