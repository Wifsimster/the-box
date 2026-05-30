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

  return (
    <Card className="border-2 border-primary/20">
      <CardContent className="pt-6 pb-5">
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 lg:min-w-[280px]">
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
            <div className="flex-1 space-y-2 text-center sm:text-left">
              <h2 className="text-2xl font-bold bg-linear-to-r from-primary to-primary/60 bg-clip-text text-transparent inline-flex items-center gap-2">
                <span>{userName}</span>
                {isPremium && <PremiumBadge compact />}
              </h2>
              <div className="space-y-1 text-xs text-muted-foreground">
                {email && <div>{email}</div>}
                <div className="flex items-center justify-center sm:justify-start gap-1.5">
                  <Calendar className="size-3" />
                  <span>{joinDate}</span>
                  {!emailVerified && (
                    <Badge variant="outline" className="text-xs ml-2">
                      {t('common.guestBadge')}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          <TooltipProvider delayDuration={200}>
            <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-3">
              <StatTile
                icon={Trophy}
                value={totalScore.toLocaleString()}
                label={t('profile.total')}
                tone="warning"
                tooltipTitle={t('profile.totalScore')}
                tooltipBody={t('profile.tooltips.totalScoreDescription')}
              />
              <StatTile
                icon={Flame}
                value={currentStreak}
                label={t('profile.days')}
                tone="score-low"
                tooltipTitle={t('profile.currentStreak')}
                tooltipBody={
                  <>
                    <p>{t('profile.tooltips.currentStreakDescription')}</p>
                    {streakFreezeCount > 0 && (
                      <p className="mt-1">
                        {t('profile.streakFreezeTooltip', { count: streakFreezeCount })}
                      </p>
                    )}
                  </>
                }
                extra={
                  streakFreezeCount > 0 ? (
                    <div className="flex items-center gap-1 text-[10px] text-neon-blue">
                      <Snowflake className="size-3" />
                      <span>× {streakFreezeCount}</span>
                    </div>
                  ) : null
                }
              />
              <StatTile
                icon={Award}
                value={earnedCount}
                label={`${completionPercentage}%`}
                tone="primary"
                tooltipTitle={t('profile.tooltips.unlockedAchievementsTitle')}
                tooltipBody={t('profile.tooltips.earnedOfTotal', { earned: earnedCount, total: totalCount })}
              />
              <StatTile
                icon={TrendingUp}
                value={totalPoints}
                label={t('profile.points')}
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
