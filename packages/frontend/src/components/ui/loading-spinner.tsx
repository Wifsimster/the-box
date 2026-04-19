import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  variant?: 'default' | 'minimal'
  className?: string
}

const sizes = {
  sm: 16,
  md: 24,
  lg: 32,
  xl: 48,
}

export function LoadingSpinner({
  size = 'md',
  variant = 'default',
  className,
}: LoadingSpinnerProps) {
  const s = sizes[size]

  if (variant === 'minimal') {
    return (
      <motion.div
        className={cn('rounded-full border-2 border-neon-purple/30 border-t-neon-purple', className)}
        style={{ width: s, height: s }}
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      />
    )
  }

  return (
    <div
      className={cn('relative', className)}
      style={{ width: s, height: s }}
    >
      {/* Outer ring - slow rotation */}
      <motion.div
        className="absolute inset-0 rounded-full border-2 border-neon-purple/20"
        animate={{ rotate: 360 }}
        transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
      />
      {/* Middle ring - medium rotation */}
      <motion.div
        className="absolute inset-[2px] rounded-full border-2 border-transparent border-t-neon-purple/50 border-r-neon-pink/50"
        animate={{ rotate: -360 }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
      />
      {/* Inner arc - fast rotation with glow */}
      <motion.div
        className="absolute inset-1 rounded-full border-2 border-transparent border-t-neon-purple"
        animate={{ rotate: 360 }}
        transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
        style={{ boxShadow: 'var(--glow-sm)' }}
      />
      {/* Center pulsing glow */}
      <motion.div
        className="absolute inset-[30%] rounded-full bg-neon-purple/30"
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.5, 0.8, 0.5],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    </div>
  )
}

// Simple inline loading indicator
export function LoadingDots({ className }: { className?: string }) {
  return (
    <div className={cn('flex gap-1', className)}>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-neon-purple"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.15,
          }}
        />
      ))}
    </div>
  )
}
