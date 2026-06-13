import { m } from 'framer-motion'
import { cn } from '@/lib/utils'

interface AnimatedProgressProps {
  value: number
  max?: number
  variant?: 'default' | 'success' | 'warning' | 'error'
  showGlow?: boolean
  animated?: boolean
  showValue?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const variantColors = {
  default: 'from-neon-purple to-neon-pink',
  success: 'from-success to-success/80',
  warning: 'from-warning to-warning/80',
  error: 'from-error to-error/80',
}

const variantGlows = {
  default: 'var(--glow-md)',
  success: 'var(--glow-success)',
  warning: 'var(--glow-warning)',
  error: 'var(--glow-error)',
}

const sizeClasses = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
}

export function AnimatedProgress({
  value,
  max = 100,
  variant = 'default',
  showGlow = true,
  animated = true,
  showValue = false,
  size = 'md',
  className,
}: AnimatedProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)
  const isInProgress = percentage > 0 && percentage < 100

  return (
    <div className={cn('w-full', className)}>
      <div
        className={cn(
          'relative w-full bg-white/10 rounded-full overflow-hidden',
          sizeClasses[size]
        )}
      >
        <m.div
          className={cn(
            'h-full rounded-full bg-linear-to-r',
            variantColors[variant]
          )}
          initial={animated ? { width: 0 } : false}
          animate={{ width: `${percentage}%` }}
          transition={{
            duration: animated ? 0.8 : 0,
            ease: [0.4, 0, 0.2, 1],
          }}
          style={
            showGlow
              ? {
                  boxShadow: variantGlows[variant],
                }
              : {}
          }
        />
        {/* Animated shimmer overlay for in-progress state */}
        {animated && isInProgress && (
          <m.div
            className="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent"
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
        )}
      </div>
      {showValue && (
        <div className="flex justify-end mt-1">
          <m.span
            className="text-xs text-muted-foreground tabular-nums"
            initial={animated ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
          >
            {Math.round(percentage)}%
          </m.span>
        </div>
      )}
    </div>
  )
}
