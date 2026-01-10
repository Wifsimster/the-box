import { motion } from 'framer-motion'
import { useGameStore } from '@/stores/gameStore'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'

// Mock live players for demo
const mockPlayers = [
  { username: 'JBSHOW', score: 622 },
  { username: 'AUGUSTIN', score: 500 },
  { username: 'CYPRIEN', score: 444 },
  { username: 'TERRACID', score: 285 },
]

export function LiveLeaderboard() {
  const { liveLeaderboard, totalScore } = useGameStore()
  const { user } = useAuthStore()

  // Use mock data if no live data
  const players = liveLeaderboard.length > 0 ? liveLeaderboard : mockPlayers

  // Add current user to the list if not present
  const currentUser = user?.username || 'YOU'
  const sortedPlayers = [...players]
    .map((p) => ({
      ...p,
      isCurrentUser: p.username === currentUser || p.username === 'YOU',
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
      <div className="space-y-2">
        {sortedPlayers.slice(0, 5).map((player, index) => (
          <motion.div
            key={player.username}
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: index * 0.1 }}
            className={cn(
              "relative",
              player.isCurrentUser && "ring-1 ring-primary rounded"
            )}
          >
            <div className="flex items-center gap-2 py-1 px-2">
              <span className="text-xs text-muted-foreground w-4">
                {index + 1}.
              </span>
              <span
                className={cn(
                  "text-sm font-medium truncate flex-1",
                  player.isCurrentUser && "text-primary"
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
                  "h-full rounded-full",
                  player.isCurrentUser ? "bg-primary" : "bg-muted-foreground/50"
                )}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
