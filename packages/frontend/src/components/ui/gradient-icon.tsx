import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type GradientIconSize = 'sm' | 'md' | 'lg'

interface GradientIconProps {
  /** A rendered icon element, e.g. `<MapPin className="w-6 h-6 text-white" />`. */
  icon: ReactNode
  /** Tile size; defaults to `md`. */
  size?: GradientIconSize
  /** Additional class names merged via `cn()`. */
  className?: string
}

const sizeClass: Record<GradientIconSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-12 w-12',
  lg: 'h-16 w-16',
}

/**
 * The recurring "purple→pink rounded square holding an icon" tile used
 * across hero sections and feature cards. Visual is sourced from the
 * shared `gradient-gaming` utility so palette tweaks stay centralized.
 */
export function GradientIcon({ icon, size = 'md', className }: GradientIconProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center justify-center rounded-xl gradient-gaming shadow-lg shadow-neon-purple/30',
        sizeClass[size],
        className,
      )}
    >
      {icon}
    </div>
  )
}
