import { useTranslation } from 'react-i18next'
import { Loader2, Check, X, Minus, Clock } from 'lucide-react'
import { formatDiscoveryTime } from '@/lib/utils'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { GuessAttemptsList } from '@/components/game/GuessAttemptsList'
import type { GameSessionDetailsResponse } from '@the-box/types'
import type { LeaderboardEntry } from './LeaderboardPanels'

/**
 * Read-only modal showing another player's daily answers, opened from a
 * leaderboard row. Extracted from LeaderboardPage to keep that component
 * focused on data orchestration.
 */
export function PlayerAnswersDialog({
  selectedPlayer,
  playerSession,
  sessionLoading,
  sessionError,
  onClose,
}: {
  selectedPlayer: LeaderboardEntry | null
  playerSession: GameSessionDetailsResponse | null
  sessionLoading: boolean
  sessionError: string | null
  onClose: () => void
}) {
  const { t } = useTranslation()
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
          <div className="space-y-4 min-w-0">
            {/* Summary */}
            <div className="flex justify-between items-center gap-3 p-3 bg-secondary/50 rounded-lg">
              <span className="text-muted-foreground truncate">{t('game.totalScore')}</span>
              <span className="font-bold text-primary text-xl shrink-0">{playerSession.totalScore}</span>
            </div>

            {/* Guesses List — merged and sorted by position ascending */}
            <div className="space-y-2">
              {[
                ...playerSession.guesses.map((guess) => ({ kind: 'guess' as const, position: guess.position, guess })),
                ...playerSession.unfoundGames.map((unfound) => ({ kind: 'unfound' as const, position: unfound.position, unfound })),
              ]
                .sort((a, b) => a.position - b.position)
                .map((item) =>
                  item.kind === 'guess' ? (
                    <div
                      key={`guess-${item.position}`}
                      className={`flex items-center gap-3 p-3 rounded-lg ${
                        item.guess.isCorrect ? 'bg-success/10 border border-success/20' : 'bg-error/10 border border-error/20'
                      }`}
                    >
                      <div className="size-8 shrink-0 rounded-full bg-secondary flex items-center justify-center text-sm font-bold">
                        {item.position}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{item.guess.correctGame.name}</div>
                        {item.guess.attempts && item.guess.attempts.length > 0 ? (
                          <>
                            <span className="text-xs text-muted-foreground block mt-0.5">
                              {t('game.attempts.count', { count: item.guess.attempts.length })}
                            </span>
                            <GuessAttemptsList attempts={item.guess.attempts} compact />
                          </>
                        ) : item.guess.userGuess ? (
                          <div className="text-sm text-muted-foreground truncate">
                            {t('game.yourGuess')}: {item.guess.userGuess}
                          </div>
                        ) : null}
                        {item.guess.isCorrect && item.guess.timeTakenMs > 0 && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            <Clock className="size-3 shrink-0" aria-hidden="true" />
                            <span>{t('game.discoveryTime', { time: formatDiscoveryTime(item.guess.timeTakenMs) })}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.guess.isCorrect ? (
                          <>
                            <span className="text-success font-bold">+{item.guess.scoreEarned}</span>
                            <Check className="size-5 text-success" />
                          </>
                        ) : (
                          <X className="size-5 text-error" />
                        )}
                      </div>
                    </div>
                  ) : (
                    <div
                      key={`unfound-${item.position}`}
                      className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border"
                    >
                      <div className="size-8 shrink-0 rounded-full bg-secondary flex items-center justify-center text-sm font-bold">
                        {item.position}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate text-muted-foreground">{item.unfound.game.name}</div>
                        <div className="text-sm text-muted-foreground">{t('leaderboard.skipped')}</div>
                      </div>
                      <Minus className="size-5 shrink-0 text-muted-foreground" />
                    </div>
                  ),
                )}
            </div>
          </div>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
