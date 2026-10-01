import { useTranslation } from 'react-i18next'
import { useNavigate, Link } from 'react-router-dom'
import { m } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ChevronRight,
  CheckCircle2,
  Clock,
  Calendar,
  Play,
  Target,
  SearchX,
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
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{t('history.noMatchingResults')}</p>
      </div>
    )
  }

  return (
    <ul className="space-y-2 list-none">
      {timeline.map((item, index) => {
        const motionProps = {
          initial: reducedMotion ? false : { opacity: 0, y: 8 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: reducedMotion ? 0 : 0.25, delay: reducedMotion ? 0 : Math.min(index, 10) * 0.03 },
        } as const

        if (item.kind === 'missed') {
          const { challenge } = item
          const dateLabel = formatDate(challenge.date)
          return (
            <m.li
              key={`missed-${challenge.challengeId}`}
              {...motionProps}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/20 bg-warning/5 p-3 sm:flex-nowrap sm:p-4"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-warning/15" aria-hidden="true">
                <Calendar className="size-5 text-warning" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm sm:text-base font-semibold first-letter:uppercase">{dateLabel}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-warning">{t('history.catchUpBadge')}</span>
                  {' · '}
                  {t('history.catchUpHint')}
                </p>
              </div>
              <Button
                variant="warning"
                onClick={() => navigate(`${localizedPath('/play')}?date=${encodeURIComponent(challenge.date)}`)}
                aria-label={t('history.resumeGame', { date: dateLabel })}
                className="w-full sm:w-auto"
              >
                <Play aria-hidden="true" />
                {t('history.playCatchUp')}
              </Button>
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
          <m.li key={entry.sessionId} {...motionProps}>
            <Link
              to={to}
              aria-label={ariaLabel}
              className="group flex items-center gap-3 rounded-lg bg-secondary/50 p-3 no-underline transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-4 sm:p-4"
            >
              <div
                className={`flex size-10 shrink-0 items-center justify-center rounded-full ${isCompleted ? 'bg-success/15' : 'bg-neon-blue/15'}`}
                aria-hidden="true"
              >
                {isCompleted ? (
                  <CheckCircle2 className="size-5 text-success" />
                ) : (
                  <Clock className="size-5 text-neon-blue" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm sm:text-base font-semibold text-foreground first-letter:uppercase">
                  {dateLabel}
                </p>
                {isCompleted ? (
                  <p className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground tabular-nums">
                    <Target className="size-3.5 shrink-0" aria-hidden="true" />
                    <span>{t('game.correctOutOf', { correct: entry.roundsCorrect, total: entry.totalScreenshots })}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      <span className="sr-only">{t('game.scoreQuality.label')}: </span>
                      {tierLabel}
                    </span>
                  </p>
                ) : (
                  <p className="text-xs sm:text-sm font-medium text-neon-blue">{t('history.inProgress')}</p>
                )}
              </div>

              <Badge
                variant={tierBadgeVariant[tier]}
                className="shrink-0 px-2.5 py-1 text-sm sm:text-base font-bold tabular-nums"
                aria-label={`${entry.totalScore} ${t('game.totalScore')} — ${tierLabel}`}
              >
                {entry.totalScore}
              </Badge>
              <ChevronRight
                className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:text-primary motion-safe:group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </m.li>
        )
      })}
    </ul>
  )
}
