import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { History, Calendar, Trophy, Loader2 } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { useAuth } from '@/hooks/useAuth'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { gameApi } from '@/lib/api/game'
import type { GameHistoryEntry } from '@/types'

export default function HistoryPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { localizedPath } = useLocalizedPath()
  const { session, isPending } = useAuth()
  const [history, setHistory] = useState<GameHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const hasFetched = useRef(false)

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isPending && !session) {
      navigate(localizedPath('/login'))
    }
  }, [isPending, session, navigate, localizedPath])

  // Fetch history only once when session is available
  useEffect(() => {
    if (session && !hasFetched.current) {
      hasFetched.current = true
      gameApi.getGameHistory()
        .then(data => setHistory(data.entries))
        .catch(() => {})
        .finally(() => setLoading(false))
    }
  }, [session])

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString(i18n.language, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  if (isPending) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <PageHero icon={History} iconStyle="simple" title={t('history.title')}>
      <div className="max-w-4xl mx-auto">
        {/* Loading State */}
        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        {/* Empty State */}
        {!loading && history.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {t('history.noResults')}
          </div>
        )}

        {/* History List */}
        {!loading && history.length > 0 && (
          <Card className="bg-card/50 border-border">
            <CardHeader>
              <CardTitle>{t('history.yourGames')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {history.map((entry, index) => (
                  <motion.div
                    key={entry.sessionId}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    className="flex items-center gap-4 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-linear-to-br from-neon-purple to-neon-pink flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <span className="font-semibold">{formatDate(entry.challengeDate)}</span>
                      {!entry.isCompleted && (
                        <span className="text-xs text-muted-foreground ml-2">
                          ({t('history.inProgress')})
                        </span>
                      )}
                    </div>
                    <div className="text-right flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-primary" />
                      <span className="font-bold text-primary">{entry.totalScore}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PageHero>
  )
}
