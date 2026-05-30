import { useTranslation } from 'react-i18next'
import { useNavigate, Link } from 'react-router-dom'
import { m } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Trophy,
  ChevronRight,
  CheckCircle2,
  Clock,
  Calendar,
  Play,
  Target,
} from 'lucide-react'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import type { GameHistoryEntry, MissedChallenge } from '@/types'

type ScoreTier = 'mastered' | 'solid' | 'shaky'

function getScoreTier(score: number): ScoreTier {
  if (score >= 1200) return 'mastered'
  if (score >= 600) return 'solid'
  return 'shaky'
}

const tierBadgeVariant: Record<ScoreTier, 'success' | 'warning' | 'destructive'> = {
  mastered: 'success',
  solid: 'warning',
  shaky: 'destructive',
}

export type TimelineItem =
  | { kind: 'played'; date: string; entry: GameHistoryEntry }
  | { kind: 'missed'; date: string; challenge: MissedChallenge }

/**
 * Unified history timeline — played sessions and missed (catch-up)
 * challenges interleaved by date. Extracted from HistoryPage so the page
 * component stays focused on data fetching and filter state.
 */
export function HistoryTimeline({
  timeline,
  reducedMotion,
  formatDate,
}: {
  timeline: TimelineItem[]
  reducedMotion: boolean
  formatDate: (dateStr: string) => string
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { localizedPath } = useLocalizedPath()

  if (timeline.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        {t('history.noMatchingResults')}
      </div>
    )
  }

  return (
    <ul className="space-y-2 sm:space-y-3 list-none">
      {timeline.map((item, index) => {
        if (item.kind === 'missed') {
          const { challenge } = item
          const dateLabel = formatDate(challenge.date)
          return (
            <m.li
              key={`missed-${challenge.challengeId}`}
              initial={reducedMotion ? false : { opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.3, delay: reducedMotion ? 0 : index * 0.05 }}
              className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg bg-warning/10 border border-warning/20"
            >
              <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                <div className="size-10 sm:size-12 shrink-0 rounded-full flex items-center justify-center bg-linear-to-br from-warning to-score-low" aria-hidden="true">
                  <Calendar className="size-5 sm:size-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm sm:text-base font-semibold wrap-break-word">
                    {dateLabel}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0">
                <Badge variant="outline" className="text-xs border-warning/50 bg-warning/10 text-warning">
                  {t('history.catchUpBadge')}
                </Badge>
                <Button
                  size="sm"
                  onClick={() => navigate(`${localizedPath('/play')}?date=${encodeURIComponent(challenge.date)}`)}
                  aria-label={t('history.resumeGame', { date: dateLabel })}
                  className="bg-linear-to-r from-warning to-score-low hover:from-warning hover:to-score-low text-white"
                >
                  <Play className="size-4 mr-1" aria-hidden="true" />
                  {t('history.playCatchUp')}
                </Button>
              </div>
            </m.li>
          )
        }

        const { entry } = item
        const tier = getScoreTier(entry.totalScore)
        const tierLabel = t(`game.scoreQuality.${tier}`)
        const dateLabel = formatDate(entry.challengeDate)
        const isCompleted = entry.isCompleted
        const to = isCompleted
          ? `${localizedPath('/history')}/${entry.sessionId}`
          : `${localizedPath('/play')}?date=${encodeURIComponent(entry.challengeDate)}`
        const ariaLabel = isCompleted
          ? t('history.viewDetails', { date: dateLabel })
          : t('history.resumeGame', { date: dateLabel })

        return (
          <m.li
            key={entry.sessionId}
            initial={reducedMotion ? false : { opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.3, delay: reducedMotion ? 0 : index * 0.05 }}
          >
            <Link
              to={to}
              aria-label={ariaLabel}
              className="group flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg bg-secondary/50 transition-all hover:bg-secondary/70 hover:ring-2 hover:ring-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:bg-secondary/70 no-underline"
            >
              {/* Left Section: Icon, Date, Status */}
              <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                {/* Dynamic icon — three-channel signal (icon + color + Badge label) */}
                <div
                  className={`size-10 sm:size-12 shrink-0 rounded-full flex items-center justify-center ${isCompleted
                    ? 'bg-linear-to-br from-success to-success/80'
                    : 'bg-linear-to-br from-neon-blue to-neon-cyan'
                    }`}
                  aria-hidden="true"
                >
                  {isCompleted ? (
                    <CheckCircle2 className="size-5 sm:size-6 text-white" />
                  ) : (
                    <Clock className="size-5 sm:size-6 text-white" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm sm:text-base font-semibold wrap-break-word text-foreground">
                      {dateLabel}
                    </span>
                    {!isCompleted && (
                      <Badge variant="info" className="w-fit text-xs">
                        <Clock className="size-3 mr-1" aria-hidden="true" />
                        {t('history.inProgress')}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Middle Section: X / N correct (primary) + tier label (secondary) */}
              {isCompleted && (
                <div className="flex flex-col items-start sm:items-end gap-0.5">
                  <div className="flex items-center gap-1.5 text-sm sm:text-base font-semibold text-foreground tabular-nums">
                    <Target className="size-3.5 sm:size-4 text-muted-foreground" aria-hidden="true" />
                    <span aria-label={t('game.correctOutOf', { correct: entry.roundsCorrect, total: entry.totalScreenshots })}>
                      {t('game.correctOutOf', { correct: entry.roundsCorrect, total: entry.totalScreenshots })}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    <span className="sr-only">{t('game.scoreQuality.label')}: </span>
                    {tierLabel}
                  </span>
                </div>
              )}

              {/* Right Section: Score & Chevron */}
              <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0">
                <div className="flex items-center gap-2">
                  <Trophy className="size-5 sm:size-6 text-primary" aria-hidden="true" />
                  <Badge
                    variant={tierBadgeVariant[tier]}
                    className="text-base sm:text-xl font-bold px-3 sm:px-4 py-1 sm:py-1.5"
                    aria-label={`${entry.totalScore} ${t('game.totalScore')} — ${tierLabel}`}
                  >
                    {entry.totalScore}
                  </Badge>
                </div>
                <ChevronRight className="size-5 sm:size-6 text-muted-foreground group-hover:text-primary group-focus-visible:text-primary group-hover:translate-x-1 group-focus-visible:translate-x-1 transition-all" aria-hidden="true" />
              </div>
            </Link>
          </m.li>
        )
      })}
    </ul>
  )
}
