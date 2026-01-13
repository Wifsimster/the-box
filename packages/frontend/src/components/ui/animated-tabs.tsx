import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

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
              'flex-shrink-0',
              'sm:flex-1',
              variant === 'underline' && 'rounded-none px-4 py-3',
              isActive
                ? 'text-white'
                : 'text-muted-foreground hover:text-white/80'
            )}
          >
            {isActive && variant === 'default' && (
              <motion.div
                layoutId="activeTab"
                className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-lg border border-purple-500/40"
                style={{ boxShadow: '0 0 20px oklch(0.7 0.25 300 / 0.2)' }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}
            {isActive && variant === 'pills' && (
              <motion.div
                layoutId="activeTabPill"
                className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg"
                style={{ boxShadow: '0 0 20px oklch(0.7 0.25 300 / 0.4)' }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}
            {isActive && variant === 'underline' && (
              <motion.div
                layoutId="activeTabUnderline"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-500 to-pink-500"
                style={{ boxShadow: '0 0 10px oklch(0.7 0.25 300 / 0.5)' }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
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
