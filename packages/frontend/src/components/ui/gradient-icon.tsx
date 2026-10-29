import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type GradientIconSize = 'sm' | 'md' | 'lg'

interface GradientIconProps {
  icon: ReactNode
  size?: GradientIconSize
  className?: string
}

const sizeClass: Record<GradientIconSize, string> = {
  sm: 'size-8',
  md: 'size-12',
  lg: 'size-16',
}

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
