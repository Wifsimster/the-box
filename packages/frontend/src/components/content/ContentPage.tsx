import type { LucideIcon } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { useHashScroll } from '@/hooks/useHashScroll'

interface ContentPageProps {
  icon: LucideIcon
  title: string
  subtitle?: string
  children: React.ReactNode
}

/**
 * Shared shell for the long-form pages (rules, FAQ, contact, legal): the
 * PageHero header without the 3D background, and a reading-width column.
 */
export function ContentPage({ icon, title, subtitle, children }: ContentPageProps) {
  useHashScroll()

  return (
    <PageHero icon={icon} title={title} subtitle={subtitle} background="none">
      <div className="mx-auto max-w-2xl space-y-6 sm:space-y-8">{children}</div>
    </PageHero>
  )
}
