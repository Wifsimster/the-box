import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { TooltipRoot, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface StatTileProps {
  icon: LucideIcon
  value: ReactNode
  label: ReactNode
  /**
   * Tailwind color stop used for the icon-bubble background and the value
   * gradient. Pass the base token name only ("warning", "primary", "success",
   * "score-low") — the component builds the bubble + gradient classes itself.
   */
  tone: 'warning' | 'primary' | 'success' | 'score-low'
  tooltipTitle: ReactNode
  tooltipBody?: ReactNode
  extra?: ReactNode
}

const TONE_CLASSES: Record<StatTileProps['tone'], { bubble: string; icon: string; gradient: string }> = {
  warning: {
    bubble: 'bg-warning/10',
    icon: 'text-warning',
    gradient: 'from-warning to-warning/70',
  },
  primary: {
    bubble: 'bg-primary/10',
    icon: 'text-primary',
    gradient: 'from-primary to-primary/60',
  },
  success: {
    bubble: 'bg-success/10',
    icon: 'text-success',
    gradient: 'from-success to-success/70',
  },
  'score-low': {
    bubble: 'bg-score-low/10',
    icon: 'text-score-low',
    gradient: 'from-score-low to-score-low/70',
  },
}

export function StatTile({
  icon: Icon,
  value,
  label,
  tone,
  tooltipTitle,
  tooltipBody,
  extra,
}: StatTileProps) {
  const tones = TONE_CLASSES[tone]
  return (
    <TooltipRoot>
      <TooltipTrigger asChild>
        <div
          tabIndex={0}
          className="flex min-w-0 flex-col items-center gap-1 rounded-lg p-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className={cn('flex items-center justify-center size-9 rounded-full', tones.bubble)} aria-hidden="true">
            <Icon className={cn('size-5', tones.icon)} />
          </div>
          <div className={cn('text-xl sm:text-2xl font-bold tabular-nums bg-linear-to-r bg-clip-text text-transparent', tones.gradient)}>
            {value}
          </div>
          <div className="text-xs leading-tight text-muted-foreground">
            {label}
          </div>
          {extra}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-center">
          <p className="font-semibold">{tooltipTitle}</p>
          {tooltipBody && (
            <div className="text-xs text-muted-foreground mt-1">{tooltipBody}</div>
          )}
        </div>
      </TooltipContent>
    </TooltipRoot>
  )
}
