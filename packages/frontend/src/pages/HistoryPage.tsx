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
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Loading State */}
        {loading && (
          <div className="flex justify-center py-8 sm:py-12">
            <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-primary" />
          </div>
        )}

        {/* Empty State */}
        {!loading && history.length === 0 && (
          <div className="text-center py-8 sm:py-12 text-sm sm:text-base text-muted-foreground">
            {t('history.noResults')}
          </div>
        )}

        {/* History List */}
        {!loading && history.length > 0 && (
          <Card className="bg-card/50 border-border">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">{t('history.yourGames')}</CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <div className="space-y-2 sm:space-y-3">
                {history.map((entry, index) => (
                  <motion.div
                    key={entry.sessionId}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    onClick={() => {
                      if (entry.isCompleted) {
                        navigate(`${localizedPath('/history')}/${entry.sessionId}`)
                      } else {
                        navigate(`${localizedPath('/play')}?date=${encodeURIComponent(entry.challengeDate)}`)
                      }
                    }}
                    className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg bg-secondary/50 transition-colors ${
                      'hover:bg-secondary cursor-pointer hover:ring-2 hover:ring-primary/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0 rounded-full bg-linear-to-br from-neon-purple to-neon-pink flex items-center justify-center">
                        <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                          <span className="text-sm sm:text-base font-semibold break-words">
                            {formatDate(entry.challengeDate)}
                          </span>
                          {!entry.isCompleted && (
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              ({t('history.inProgress')})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-end sm:justify-start gap-2 sm:gap-2 flex-shrink-0">
                      <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                      <span className="text-base sm:text-lg font-bold text-primary">
                        {entry.totalScore}
                      </span>
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
