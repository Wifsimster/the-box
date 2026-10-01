import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { m } from 'framer-motion'
import { Trophy, Award, TrendingUp, Flame, Calendar, Snowflake } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AvatarUpload } from './AvatarUpload'
import { PremiumBadge } from './PremiumBadge'
import { StatTile } from './StatTile'
import { cn } from '@/lib/utils'

interface ProfileHeaderCardProps {
  avatarUrl: string | null
  userName: string | null | undefined
  userInitials: string
  email: string | null | undefined
  emailVerified: boolean
  joinDate: string
  isPremium: boolean
  totalScore: number
  currentStreak: number
  streakFreezeCount: number
  earnedCount: number
  totalCount: number
  completionPercentage: number
  totalPoints: number
  onAvatarChange: (newAvatarUrl: string | null) => void
}

export function ProfileHeaderCard({
  avatarUrl,
  userName,
  userInitials,
  email,
  emailVerified,
  joinDate,
  isPremium,
  totalScore,
  currentStreak,
  streakFreezeCount,
  earnedCount,
  totalCount,
  completionPercentage,
  totalPoints,
  onAvatarChange,
}: ProfileHeaderCardProps) {
  const { t } = useTranslation()

  // Memoised so the streak tooltip body keeps a stable reference between
  // renders unless its inputs change, instead of allocating JSX every render.
  const currentStreakTooltipBody = useMemo(
    () => (
      <>
        <p>{t('profile.tooltips.currentStreakDescription')}</p>
        {streakFreezeCount > 0 && (
          <p className="mt-1">
            {t('profile.streakFreezeTooltip', { count: streakFreezeCount })}
          </p>
        )}
      </>
    ),
    [t, streakFreezeCount],
  )

  return (
    <Card variant="neon">
      <CardContent className="pt-(--card-padding)">
        <div className="flex flex-col lg:flex-row lg:items-center gap-5 lg:gap-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 min-w-0 lg:min-w-[280px]">
            <m.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
              className={cn(isPremium && 'premium-frame')}
            >
              <AvatarUpload
                currentAvatarUrl={avatarUrl}
                userName={userName}
                userInitials={userInitials}
                onAvatarChange={onAvatarChange}
              />
            </m.div>
            <div className="flex-1 min-w-0 space-y-2 text-center sm:text-left">
              <h1 className="flex max-w-full items-center justify-center sm:justify-start gap-2 text-2xl sm:text-3xl font-bold">
                <span className="min-w-0 wrap-break-word bg-linear-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  {userName}
                </span>
                {isPremium && <PremiumBadge compact />}
              </h1>
              <div className="space-y-1 text-sm text-muted-foreground">
                {email && <div className="break-all">{email}</div>}
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-1.5 gap-y-1">
                  <Calendar className="size-3.5" aria-hidden="true" />
                  {/* The player noun earns a job here rather than sitting in
                      the random end-of-run message pool: it names who this
                      profile belongs to, dated (docs/brand.md §1). */}
                  <span>{t('profile.memberSince', { date: joinDate })}</span>
                  {!emailVerified && (
                    <Badge variant="outline" className="text-xs">
                      {t('common.guestBadge')}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          <TooltipProvider delayDuration={200}>
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <StatTile
                icon={Trophy}
                value={totalScore.toLocaleString()}
                label={t('profile.totalScore')}
                tone="warning"
                tooltipTitle={t('profile.totalScore')}
                tooltipBody={t('profile.tooltips.totalScoreDescription')}
              />
              <StatTile
                icon={Flame}
                value={currentStreak}
                label={t('profile.currentStreak')}
                tone="score-low"
                tooltipTitle={t('profile.currentStreak')}
                tooltipBody={currentStreakTooltipBody}
                extra={
                  streakFreezeCount > 0 ? (
                    <div className="flex items-center gap-1 text-xs text-neon-blue">
                      <Snowflake className="size-3" aria-hidden="true" />
                      <span>× {streakFreezeCount}</span>
                      <span className="sr-only">{t('profile.streakFreezeTooltip', { count: streakFreezeCount })}</span>
                    </div>
                  ) : null
                }
              />
              <StatTile
                icon={Award}
                value={`${earnedCount}/${totalCount}`}
                label={`${t('profile.tooltips.unlockedAchievementsTitle')} · ${completionPercentage}%`}
                tone="primary"
                tooltipTitle={t('profile.tooltips.unlockedAchievementsTitle')}
                tooltipBody={t('profile.tooltips.earnedOfTotal', { earned: earnedCount, total: totalCount })}
              />
              <StatTile
                icon={TrendingUp}
                value={totalPoints}
                label={t('profile.achievementPoints')}
                tone="success"
                tooltipTitle={t('profile.achievementPoints')}
                tooltipBody={t('profile.tooltips.achievementPointsDescription')}
              />
            </div>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  )
}
