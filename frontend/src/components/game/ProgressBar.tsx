import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface ProgressBarProps {
  current: number
  total: number
}

export function ProgressBar({ current, total }: ProgressBarProps) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }, (_, i) => {
        const position = i + 1
        const isCompleted = position < current
        const isCurrent = position === current
        const isUpcoming = position > current

        return (
          <motion.div
            key={position}
            className={cn(
              "relative flex items-center justify-center",
              "w-8 h-8 rounded text-xs font-bold transition-colors",
              isCompleted && "bg-primary text-primary-foreground",
              isCurrent && "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background",
              isUpcoming && "bg-muted text-muted-foreground"
            )}
            initial={isCurrent ? { scale: 0.8 } : {}}
            animate={isCurrent ? { scale: 1 } : {}}
            transition={{ type: 'spring', stiffness: 300 }}
          >
            {position}

            {/* Connecting line */}
            {position < total && (
              <div
                className={cn(
                  "absolute left-full w-1 h-0.5",
                  isCompleted ? "bg-primary" : "bg-muted"
                )}
              />
            )}
          </motion.div>
        )
      })}
    </div>
  )
}
