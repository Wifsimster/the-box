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

export const fadeInLeft: Variants = {
  initial: { opacity: 0, x: -20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 20 },
}

// ============================================================================
// List and Table Animations
// ============================================================================

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
