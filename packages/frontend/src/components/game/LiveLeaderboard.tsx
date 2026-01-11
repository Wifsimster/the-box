import { motion } from 'framer-motion'
import { RotateCcw } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import { useAuthStore } from '@/stores/authStore'
import { usePartyStore } from '@/stores/partyStore'
import { cn } from '@/lib/utils'

/**
 * Leaderboard player interface
 */
interface LeaderboardPlayer {
  username: string
  score: number
  isCurrentUser?: boolean
}

/**
 * Presentational component for live leaderboard
 *
 * Pure UI component that accepts data via props
 * Follows SOLID principles - no direct store dependencies
 */
export function LiveLeaderboardView({
  players,
  currentUsername,
  isHost = false,
  isInParty = false,
  onResetGame,
}: {
  players: Array<{ username: string; score: number }>
  currentUsername: string | null
  isHost?: boolean
  isInParty?: boolean
  onResetGame?: () => void
}) {
  // Only show if there are players
  if (players.length === 0) {
    return null
  }

  // Process and sort players
  const sortedPlayers: LeaderboardPlayer[] = [...players]
    .map((p) => ({
      ...p,
      isCurrentUser:
        p.username === currentUsername || p.username === 'YOU',
    }))
    .sort((a, b) => b.score - a.score)

  // Find max score for bar width calculation
  const maxScore = Math.max(...sortedPlayers.map((p) => p.score), 1)

  return (
    <motion.div
      initial={{ x: -50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="w-48 bg-card/60 backdrop-blur-sm border border-border rounded-lg p-3 shadow-lg"
    >
      {/* Party host reset button */}
      {isInParty && isHost && onResetGame && (
        <button
          onClick={onResetGame}
          className="w-full mb-2 flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium text-orange-400 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 rounded-md transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          Recommencer
        </button>
      )}

      <div className="space-y-2">
        {sortedPlayers.slice(0, 5).map((player, index) => (
          <motion.div
            key={player.username}
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: index * 0.1 }}
            className={cn(
              'relative',
              player.isCurrentUser && 'ring-1 ring-primary rounded'
            )}
          >
            <div className="flex items-center gap-2 py-1 px-2">
              <span className="text-xs text-muted-foreground w-4">
                {index + 1}.
              </span>
              <span
                className={cn(
                  'text-sm font-medium truncate flex-1',
                  player.isCurrentUser && 'text-primary'
                )}
              >
                {player.username}
              </span>
              <span className="text-sm font-bold tabular-nums">
                {player.score}
              </span>
            </div>

            {/* Score bar */}
            <div className="mx-2 h-1 bg-muted rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(player.score / maxScore) * 100}%` }}
                transition={{ delay: index * 0.1 + 0.2, duration: 0.3 }}
                className={cn(
                  'h-full rounded-full',
                  player.isCurrentUser
                    ? 'bg-primary'
                    : 'bg-muted-foreground/50'
                )}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}

/**
 * Container component that fetches data from stores
 *
 * Separates data fetching from presentation
 * Makes the presentational component reusable and testable
 */
export function LiveLeaderboard() {
  const { liveLeaderboard } = useGameStore()
  const { user } = useAuthStore()
  const { isHost, isInParty, leaderboard: partyLeaderboard, resetGame } = usePartyStore()

  // Use party leaderboard if in party, otherwise use game store leaderboard
  const players = isInParty ? partyLeaderboard : liveLeaderboard

  return (
    <LiveLeaderboardView
      players={players}
      currentUsername={user?.username || user?.name || null}
      isHost={isHost}
      isInParty={isInParty}
      onResetGame={resetGame}
    />
  )
}
