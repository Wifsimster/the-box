import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { SessionDetails } from '@/components/game/SessionDetails'
import { mergeSessionResults } from '@/lib/sessionResults'
import { useReducedMotionSafe } from '@/hooks/useReducedMotionSafe'
import type { GameSessionDetailsResponse } from '@the-box/types'
import type { LeaderboardEntry } from './LeaderboardPanels'

/**
 * Modal showing a player's daily answers, opened from a leaderboard row.
 *
 * It renders the same shared {@link SessionDetails} body as the post-game
 * results and game-history pages — so it shows the full breakdown (score,
 * ranking, per-screenshot results) instead of a stripped-down list. The
 * ShareCard is only enabled when the row is the signed-in user's own score.
 */
export function PlayerAnswersDialog({
  selectedPlayer,
  playerSession,
  sessionLoading,
  sessionError,
  currentUserId,
  totalPlayers,
  onClose,
}: {
  selectedPlayer: LeaderboardEntry | null
  playerSession: GameSessionDetailsResponse | null
  sessionLoading: boolean
  sessionError: string | null
  currentUserId: string | null
  totalPlayers: number
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const reducedMotion = useReducedMotionSafe()

  const isOwn = Boolean(currentUserId) && selectedPlayer?.userId === currentUserId
  const rank = selectedPlayer?.rank ?? null
  // Derive "top X%" from the row's rank — the daily board has no separate
  // percentile endpoint, but rank / total is the same information.
  const percentile =
    rank !== null && totalPlayers > 0
      ? Math.max(1, Math.ceil((rank / totalPlayers) * 100))
      : null

  const results = useMemo(
    () => (playerSession ? mergeSessionResults(playerSession) : []),
    [playerSession],
  )

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(i18n.language, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

  return (
    <ResponsiveDialog open={!!selectedPlayer} onOpenChange={(open) => !open && onClose()}>
      <ResponsiveDialogContent className="sm:max-w-2xl">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center gap-3 min-w-0 pr-8">
            {selectedPlayer && (
              <>
                <Avatar className="size-8 shrink-0">
                  <AvatarImage src={selectedPlayer.avatarUrl} alt={selectedPlayer.displayName} />
                  <AvatarFallback className="bg-linear-to-br from-neon-purple to-neon-pink text-sm font-bold">
                    {selectedPlayer.displayName[0]}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">
                  {t('leaderboard.playerAnswers', { name: selectedPlayer.displayName })}
                </span>
              </>
            )}
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        {sessionLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="size-8 animate-spin text-primary" />
          </div>
        )}

        {sessionError && (
          <div className="text-center py-8 text-destructive">{sessionError}</div>
        )}

        {playerSession && !sessionLoading && (
          <SessionDetails
            results={results}
            totalScore={playerSession.totalScore}
            totalScreenshots={playerSession.totalScreenshots}
            challengeDate={playerSession.challengeDate}
            isPersonalBest={playerSession.isPersonalBest}
            heroTitle={formatDate(playerSession.challengeDate)}
            percentile={percentile}
            rank={rank}
            totalPlayers={totalPlayers > 0 ? totalPlayers : null}
            shareEnabled={isOwn}
            reducedMotion={reducedMotion}
            bare
          />
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
