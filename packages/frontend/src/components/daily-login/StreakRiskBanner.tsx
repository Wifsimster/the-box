import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Flame, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSession } from '@/lib/auth-client'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'

const DISMISS_KEY = 'theBox.streakRiskDismissedDate'

interface MinimalProfile {
  currentStreak?: number
  lastPlayedAt?: string
}

function startOfUTCDay(iso: string): number {
  const d = new Date(iso)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/**
 * Shows a banner when a logged-in user with an active streak hasn't played
 * today yet — complements the existing streak-risk email so users see the
 * nudge in-app too. Dismissal persists only for the current UTC day.
 */
export function StreakRiskBanner() {
  const { t } = useTranslation()
  const { data: session } = useSession()
  const { localizedPath } = useLocalizedPath()
  const [streak, setStreak] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState(() => {
    try {
      const todayKey = new Date().toISOString().split('T')[0]
      return localStorage.getItem(DISMISS_KEY) === todayKey
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (!session?.user || session.user.isAnonymous) return
    const controller = new AbortController()

    fetch('/api/user/me', { credentials: 'include', signal: controller.signal })
      .then((res) => res.json())
      .then((json: { success: boolean; data?: MinimalProfile }) => {
        if (controller.signal.aborted || !json.success || !json.data) return
        const { currentStreak = 0, lastPlayedAt } = json.data

        // Need an active multi-day streak to be worth warning about.
        if (currentStreak < 2 || !lastPlayedAt) return

        const todayUTC = Date.UTC(
          new Date().getUTCFullYear(),
          new Date().getUTCMonth(),
          new Date().getUTCDate()
        )
        const lastDayUTC = startOfUTCDay(lastPlayedAt)

        // Already played today → no risk.
        if (lastDayUTC === todayUTC) return

        // If a full day or more has already passed since last play, the
        // streak-grace logic will handle it; the banner is for *today* only.
        if (todayUTC - lastDayUTC > 24 * 60 * 60 * 1000) return

        setStreak(currentStreak)
      })
      .catch(() => {
        // non-fatal — banner just won't appear
      })

    return () => {
      controller.abort()
    }
  }, [session?.user, session?.user?.isAnonymous])

  const handleDismiss = () => {
    const todayKey = new Date().toISOString().split('T')[0]!
    try {
      localStorage.setItem(DISMISS_KEY, todayKey)
    } catch {
      // storage blocked — dismissal won't persist across reloads
    }
    setDismissed(true)
  }

  if (streak === null || dismissed) return null

  return (
    <div className="mb-6 rounded-xl border border-neon-pink/30 bg-linear-to-r from-neon-pink/10 via-neon-purple/10 to-transparent p-4 flex items-center gap-3">
      <Flame className="w-5 h-5 text-neon-pink shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">
          {t('streakRisk.title', { count: streak })}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('streakRisk.subtitle')}
        </p>
      </div>
      <Button variant="gaming" size="sm" asChild>
        <Link to={localizedPath('/game')}>{t('streakRisk.cta')}</Link>
      </Button>
      <button
        type="button"
        onClick={handleDismiss}
        className="text-muted-foreground hover:text-foreground transition-colors"
        aria-label={t('common.close')}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
