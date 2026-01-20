import { motion } from 'framer-motion'
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
  default: 'from-purple-500 to-pink-500',
  success: 'from-green-500 to-emerald-400',
  warning: 'from-yellow-500 to-orange-400',
  error: 'from-red-500 to-rose-400',
}

const variantGlows = {
  default: '0 0 15px oklch(0.7 0.25 300 / 0.5)',
  success: '0 0 15px oklch(0.7 0.2 145 / 0.5)',
  warning: '0 0 15px oklch(0.8 0.15 85 / 0.5)',
  error: '0 0 15px oklch(0.65 0.25 25 / 0.5)',
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
        <motion.div
          className={cn(
            'h-full rounded-full bg-gradient-to-r',
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
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
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
          <motion.span
            className="text-xs text-muted-foreground tabular-nums"
            initial={animated ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
          >
            {Math.round(percentage)}%
          </motion.span>
        </div>
      )}
    </div>
  )
}
