import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { m } from 'framer-motion'
import { Trophy, Target } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { PercentileBanner } from '@/components/game/PercentileBanner'
import { ShareCard } from '@/components/game/ShareCard'
import { SessionResultsList } from '@/components/game/SessionResultsList'
import { countCorrect, computeAccuracy } from '@/lib/sessionResults'
import type { GuessResult } from '@/types'

export interface SessionDetailsProps {
  /** Position-sorted, merged guesses (see `mergeSessionResults`). */
  results: GuessResult[]
  /** Authoritative session score (already includes penalties). */
  totalScore: number
  totalScreenshots: number
  /** ISO date of the challenge — used by the share text. */
  challengeDate?: string
  /** Drives the gold "personal best" hero treatment. */
  isPersonalBest?: boolean

  /** Hero headline (e.g. "Tier complete" or a formatted challenge date). */
  heroTitle: string
  /**
   * Copy shown instead of the celebratory hero when the player scored 0.
   * Only the history recap passes this; elsewhere a 0 just renders normally.
   */
  zeroScore?: { title: string; subtitle: string }

  /** Optional ranking banner. Hidden when `percentile`/`totalPlayers` are null. */
  percentile?: number | null
  rank?: number | null
  totalPlayers?: number | null
  isLoadingPercentile?: boolean

  /** Render the ShareCard. Only enable for the viewer's own session. */
  shareEnabled?: boolean

  /** Page-level navigation rendered next to the share button. */
  actions?: ReactNode

  /** Skip the surrounding Card (used inside a dialog that is already a panel). */
  bare?: boolean
  reducedMotion?: boolean
}

/**
 * Unified body for every "what happened in this session" surface: the
 * post-game results page, the game-history details page, and the leaderboard
 * answers dialog. It owns the score hero, the optional ranking banner, the
 * share action, and the per-screenshot breakdown — so all three views show
 * the same data and features instead of three drifting re-implementations.
 *
 * View-specific chrome (page container, back button, dialog title) stays in
 * the caller; this component is the shared middle.
 */
export function SessionDetails({
  results,
  totalScore,
  totalScreenshots,
  challengeDate,
  isPersonalBest = false,
  heroTitle,
  zeroScore,
  percentile = null,
  rank = null,
  totalPlayers = null,
  isLoadingPercentile = false,
  shareEnabled = false,
  actions,
  bare = false,
  reducedMotion = false,
}: SessionDetailsProps) {
  const { t } = useTranslation()
  const correctAnswers = countCorrect(results)
  const accuracy = computeAccuracy(correctAnswers, totalScreenshots)
  const isZero = totalScore === 0
  const showZeroState = isZero && Boolean(zeroScore)

  const list = (
    <SessionResultsList
      results={results}
      totalScreenshots={totalScreenshots}
      reducedMotion={reducedMotion}
    />
  )

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Score hero */}
      <m.div
        initial={reducedMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.5 }}
        className="text-center"
      >
        {showZeroState ? (
          <div
            className="inline-flex items-center justify-center size-14 sm:size-20 mb-2 sm:mb-4 rounded-full bg-secondary border border-border"
            aria-hidden="true"
          >
            <Target className="size-7 sm:size-10 text-muted-foreground" />
          </div>
        ) : (
          <>
            <m.div
              initial={reducedMotion ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: reducedMotion ? 0 : 0.5, delay: reducedMotion ? 0 : 0.2, type: reducedMotion ? 'tween' : 'spring' }}
              style={{ boxShadow: isPersonalBest ? 'var(--glow-lg)' : 'var(--glow-md)' }}
              className={`inline-flex items-center justify-center size-14 sm:size-20 mb-2 sm:mb-4 rounded-full bg-linear-to-br ${isPersonalBest
                ? 'from-medal-gold to-medal-gold/70'
                : 'from-neon-purple to-neon-pink'
                }`}
              aria-hidden="true"
            >
              <Trophy className="size-7 sm:size-10 text-white" />
            </m.div>
            {isPersonalBest && (
              <div className="mb-2">
                <Badge variant="warning" className="text-medal-gold border-medal-gold/40 bg-medal-gold/10">
                  <Trophy className="size-3 mr-1" aria-hidden="true" />
                  {t('history.personalBest')}
                </Badge>
              </div>
            )}
          </>
        )}

        {showZeroState ? (
          <>
            <h1 className="text-xl sm:text-3xl md:text-4xl font-bold mb-2 text-foreground">
              {zeroScore!.title}
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mb-2 sm:mb-4 max-w-md mx-auto">
              {zeroScore!.subtitle}
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-4">{heroTitle}</p>
          </>
        ) : (
          <h1 className="text-xl sm:text-3xl md:text-4xl font-bold mb-1.5 sm:mb-3 gradient-gaming bg-clip-text text-transparent">
            {heroTitle}
          </h1>
        )}

        <m.div
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reducedMotion ? 0 : 0.5, delay: reducedMotion ? 0 : 0.4 }}
          className={`text-4xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-2 sm:mb-4 ${isZero
            ? 'text-muted-foreground'
            : isPersonalBest
              ? 'text-medal-gold'
              : 'text-primary'
            }`}
          aria-label={`${totalScore} ${t('game.totalScore')}${isPersonalBest ? ` — ${t('history.personalBest')}` : ''}`}
        >
          {totalScore} pts
        </m.div>

        <div className="flex justify-center gap-4 sm:gap-6 md:gap-8 text-muted-foreground">
          <div className="flex flex-col items-center">
            <div className="flex items-baseline gap-1">
              <span className="text-foreground font-bold text-lg sm:text-xl md:text-2xl">{correctAnswers}</span>
              <span className="text-xs sm:text-sm">/{totalScreenshots}</span>
            </div>
            <p className="text-xs sm:text-sm mt-1">{t('game.correctAnswers')}</p>
          </div>
          <Separator orientation="vertical" className="h-8 sm:h-10 md:h-12" />
          <div className="flex flex-col items-center">
            <span className="text-foreground font-bold text-lg sm:text-xl md:text-2xl">{accuracy}%</span>
            <p className="text-xs sm:text-sm mt-1">{t('game.accuracy')}</p>
          </div>
        </div>
      </m.div>

      {/* Ranking banner */}
      <PercentileBanner
        percentile={percentile}
        rank={rank}
        totalPlayers={totalPlayers}
        isLoading={isLoadingPercentile}
      />

      {/* Share + page actions */}
      {(shareEnabled || actions) && (
        <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
          {shareEnabled && (
            <ShareCard
              score={totalScore}
              correctAnswers={correctAnswers}
              totalScreenshots={totalScreenshots}
              percentile={percentile ?? undefined}
              rank={rank ?? undefined}
              totalPlayers={totalPlayers ?? undefined}
              challengeDate={challengeDate || undefined}
              guessResults={results}
            />
          )}
          {actions}
        </div>
      )}

      {/* Per-screenshot breakdown */}
      {bare ? (
        <div>
          <h2 className="font-semibold text-base sm:text-lg mb-3 sm:mb-4">{t('game.resultsSummary')}</h2>
          {list}
        </div>
      ) : (
        <Card className="bg-card/50 border-border">
          <CardContent className="pt-4 sm:pt-6">
            <h2 className="font-semibold text-base sm:text-lg mb-3 sm:mb-4">{t('game.resultsSummary')}</h2>
            {list}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
