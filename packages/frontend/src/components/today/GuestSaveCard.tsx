import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'

interface GuestSaveCardProps {
  rank: number | null
  totalPlayers: number | null
  className?: string
}

export function GuestSaveCard({ rank, totalPlayers, className }: GuestSaveCardProps) {
  const { t } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const hasRank = rank !== null && totalPlayers !== null

  return (
    <Card variant="warning" className={className}>
      <CardContent className="flex flex-col gap-3 pt-(--card-padding) sm:flex-row sm:items-center">
        <UserPlus className="size-6 shrink-0 text-warning" aria-hidden="true" />
        <div className="flex-1 space-y-1">
          <h2 className="font-semibold text-foreground">
            {hasRank ? t('today.guestRankTitle', { rank, total: totalPlayers }) : t('today.guestSaveTitle')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {hasRank ? t('today.guestRankBody') : t('today.guestSaveBody')}
          </p>
        </div>
        <Button variant="gaming" asChild>
          <Link to={localizedPath('/register')}>{t('today.guestSaveCta')}</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
