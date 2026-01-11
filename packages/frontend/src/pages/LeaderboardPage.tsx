import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Trophy, Medal, Award, Loader2 } from 'lucide-react'

interface LeaderboardEntry {
  rank: number
  username: string
  displayName: string
  totalScore: number
  completedAt?: string
}

export default function LeaderboardPage() {
  const { t } = useTranslation()
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/leaderboard/today')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data?.entries) {
          setLeaderboard(data.data.entries)
        }
      })
      .catch(() => {
        // Silently fail
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="w-5 h-5 text-yellow-500" />
      case 2:
        return <Medal className="w-5 h-5 text-zinc-400" />
      case 3:
        return <Award className="w-5 h-5 text-amber-600" />
      default:
        return <span className="text-muted-foreground font-bold">{rank}</span>
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Page Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-xl bg-linear-to-br from-neon-purple to-neon-pink shadow-lg shadow-neon-purple/30">
            <Trophy className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold bg-linear-to-r from-neon-purple to-neon-pink bg-clip-text text-transparent">
            {t('leaderboard.title')}
          </h1>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        {/* Empty State */}
        {!loading && leaderboard.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {t('leaderboard.noResults')}
          </div>
        )}

        {/* Top 3 Podium */}
        {!loading && leaderboard.length >= 3 && (
          <div className="flex justify-center gap-4 mb-8">
            {leaderboard.slice(0, 3).map((entry, index) => {
              const order = [1, 0, 2][index] // Silver, Gold, Bronze order
              const heights = ['h-24', 'h-32', 'h-20']
              const colors = ['from-zinc-400 to-zinc-500', 'from-yellow-400 to-yellow-600', 'from-amber-600 to-amber-700']

              return (
                <motion.div
                  key={entry.rank}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: order! * 0.1 }}
                  className={`flex flex-col items-center ${index === 1 ? 'order-first' : ''}`}
                >
                  <div className="w-16 h-16 rounded-full bg-linear-to-br from-neon-purple to-neon-pink flex items-center justify-center text-xl font-bold mb-2">
                    {entry.displayName[0]}
                  </div>
                  <span className="font-semibold mb-1">{entry.displayName}</span>
                  <span className="text-primary font-bold">{entry.totalScore}</span>
                  <div className={`w-20 ${heights[index]} bg-linear-to-t ${colors[index]} rounded-t-lg mt-2 flex items-start justify-center pt-2`}>
                    <span className="text-2xl font-bold text-white">{entry.rank}</span>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}

        {/* Full Leaderboard Table */}
        {!loading && leaderboard.length > 0 && (
          <Card className="bg-card/50 border-border">
            <CardHeader>
              <CardTitle>{t('leaderboard.today')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {leaderboard.map((entry, index) => (
                  <motion.div
                    key={entry.rank}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    className="flex items-center gap-4 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                  >
                    <div className="w-8 flex justify-center">
                      {getRankIcon(entry.rank)}
                    </div>
                    <div className="w-10 h-10 rounded-full bg-linear-to-br from-neon-purple to-neon-pink flex items-center justify-center font-bold">
                      {entry.displayName[0]}
                    </div>
                    <div className="flex-1">
                      <span className="font-semibold">{entry.displayName}</span>
                      <span className="text-xs text-muted-foreground ml-2">@{entry.username}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-primary">{entry.totalScore}</div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </motion.div>
    </div>
  )
}
