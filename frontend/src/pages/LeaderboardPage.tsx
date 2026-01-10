import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Trophy, Medal, Award } from 'lucide-react'

// Mock data for now
const mockLeaderboard = [
  { rank: 1, username: 'JBSHOW', displayName: 'JB Show', score: 2450, time: '12:34' },
  { rank: 2, username: 'AUGUSTIN', displayName: 'Augustin', score: 2380, time: '13:21' },
  { rank: 3, username: 'CYPRIEN', displayName: 'Cyprien', score: 2210, time: '14:05' },
  { rank: 4, username: 'TERRACID', displayName: 'Terracid', score: 1950, time: '15:42' },
  { rank: 5, username: 'PLAYER5', displayName: 'Player 5', score: 1820, time: '16:18' },
]

export default function LeaderboardPage() {
  const { t } = useTranslation()

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="w-5 h-5 text-yellow-500" />
      case 2:
        return <Medal className="w-5 h-5 text-gray-400" />
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
        <h1 className="text-3xl font-bold mb-8 flex items-center gap-3">
          <Trophy className="w-8 h-8 text-primary" />
          {t('leaderboard.title')}
        </h1>

        {/* Top 3 Podium */}
        <div className="flex justify-center gap-4 mb-8">
          {mockLeaderboard.slice(0, 3).map((entry, index) => {
            const order = [1, 0, 2][index] // Silver, Gold, Bronze order
            const heights = ['h-24', 'h-32', 'h-20']
            const colors = ['from-gray-400 to-gray-500', 'from-yellow-400 to-yellow-600', 'from-amber-600 to-amber-700']

            return (
              <motion.div
                key={entry.rank}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: order * 0.1 }}
                className={`flex flex-col items-center ${index === 1 ? 'order-first' : ''}`}
              >
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-neon-purple to-neon-pink flex items-center justify-center text-xl font-bold mb-2">
                  {entry.displayName[0]}
                </div>
                <span className="font-semibold mb-1">{entry.displayName}</span>
                <span className="text-primary font-bold">{entry.score}</span>
                <div className={`w-20 ${heights[index]} bg-gradient-to-t ${colors[index]} rounded-t-lg mt-2 flex items-start justify-center pt-2`}>
                  <span className="text-2xl font-bold text-white">{entry.rank}</span>
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Full Leaderboard Table */}
        <Card>
          <CardHeader>
            <CardTitle>{t('leaderboard.today')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {mockLeaderboard.map((entry, index) => (
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
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-neon-purple to-neon-pink flex items-center justify-center font-bold">
                    {entry.displayName[0]}
                  </div>
                  <div className="flex-1">
                    <span className="font-semibold">{entry.displayName}</span>
                    <span className="text-xs text-muted-foreground ml-2">@{entry.username}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-primary">{entry.score}</div>
                    <div className="text-xs text-muted-foreground">{entry.time}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
