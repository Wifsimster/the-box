import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { m } from 'framer-motion'
import { Users } from 'lucide-react'

/**
 * Live social-proof badge: "N players have taken on today's challenge".
 * Backed by real data from GET /api/leaderboard/today/count — never a
 * fabricated number. Renders nothing until a positive count arrives, so we
 * never show a deflating "0 players" on a fresh challenge or while loading.
 */
export function HomeSocialProof() {
  const { t, i18n } = useTranslation()
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch('/api/leaderboard/today/count')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json?.success) setCount(Number(json.data?.count ?? 0))
      })
      .catch(() => {
        /* fail-soft: no badge if the count can't be fetched */
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (count <= 0) return null

  const formatted = new Intl.NumberFormat(i18n.language).format(count)

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="mt-4 flex justify-center"
    >
      <span className="inline-flex items-center gap-2 rounded-full border border-neon-purple/30 bg-card/60 backdrop-blur-sm px-3 py-1.5 text-xs sm:text-sm text-muted-foreground">
        <Users className="size-4 text-neon-cyan" aria-hidden="true" />
        {t('home.playersToday', { count, formatted })}
      </span>
    </m.div>
  )
}
