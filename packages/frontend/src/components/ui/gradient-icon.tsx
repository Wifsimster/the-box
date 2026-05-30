import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type GradientIconSize = 'sm' | 'md' | 'lg'

interface GradientIconProps {
  /** A rendered icon element, e.g. `<MapPin className="size-6 text-white" />`. */
  icon: ReactNode
  /** Tile size; defaults to `md`. */
  size?: GradientIconSize
  /** Additional class names merged via `cn()`. */
  className?: string
}

const sizeClass: Record<GradientIconSize, string> = {
  sm: 'size-8',
  md: 'size-12',
  lg: 'size-16',
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
