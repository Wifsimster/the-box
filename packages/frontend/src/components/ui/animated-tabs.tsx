import { m } from 'framer-motion'
import { cn } from '@/lib/utils'
import { springConfig } from '@/lib/animations'

interface Tab {
  id: string
  label: string
  icon?: React.ReactNode
}

interface AnimatedTabsProps {
  tabs: Tab[]
  activeTab: string
  onChange: (tabId: string) => void
  className?: string
  variant?: 'default' | 'pills' | 'underline'
}

export function AnimatedTabs({
  tabs,
  activeTab,
  onChange,
  className,
  variant = 'default',
}: AnimatedTabsProps) {
  return (
    <div
      className={cn(
        'flex gap-1 p-1 rounded-xl overflow-x-auto scrollbar-hide',
        variant === 'default' && 'bg-muted/50 border border-white/10',
        variant === 'pills' && 'bg-transparent gap-2',
        variant === 'underline' && 'bg-transparent border-b border-white/10 rounded-none p-0 gap-0',
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id

        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              'relative px-4 py-2 text-sm font-medium rounded-lg transition-colors',
              'shrink-0',
              'sm:flex-1',
              variant === 'underline' && 'rounded-none px-4 py-3',
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {isActive && variant === 'default' && (
              <m.div
                layoutId="activeTab"
                className="absolute inset-0 bg-linear-to-r from-neon-purple/20 to-neon-pink/20 rounded-lg border border-neon-purple/40 glow-sm"
                transition={springConfig.snappy}
              />
            )}
            {isActive && variant === 'pills' && (
              <m.div
                layoutId="activeTabPill"
                className="absolute inset-0 bg-linear-to-r from-neon-purple to-neon-pink rounded-lg glow-md"
                transition={springConfig.snappy}
              />
            )}
            {isActive && variant === 'underline' && (
              <m.div
                layoutId="activeTabUnderline"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-linear-to-r from-neon-purple to-neon-pink glow-sm"
                transition={springConfig.snappy}
              />
            )}
            <span className="relative z-10 flex items-center justify-center gap-2">
              {tab.icon}
              {tab.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
