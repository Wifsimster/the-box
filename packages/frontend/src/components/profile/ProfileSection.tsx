import type { ReactNode } from 'react'
import { m } from 'framer-motion'

interface ProfileSectionProps {
  children: ReactNode
  delay?: number
}

export function ProfileSection({ children, delay = 0 }: ProfileSectionProps) {
  return (
    <m.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      {children}
    </m.div>
  )
}
