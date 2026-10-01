import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Flame, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useSession } from '@/lib/auth-client'

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
 * Loads the minimal profile and returns the active streak count when (and
 * only when) the user is at risk of losing it today, otherwise null. Kept at
 * module scope so the data access lives outside the React render/effect path.
 */
async function fetchStreakAtRisk(signal: AbortSignal): Promise<number | null> {
  const res = await fetch('/api/user/me', {
    credentials: 'include',
    signal,
  })
  const json = (await res.json()) as {
    success: boolean
    data?: MinimalProfile
  }
  if (signal.aborted || !json.success || !json.data) return null
  const { currentStreak = 0, lastPlayedAt } = json.data

  // Need an active multi-day streak to be worth warning about.
  if (currentStreak < 2 || !lastPlayedAt) return null

  const todayUTC = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate()
  )
  const lastDayUTC = startOfUTCDay(lastPlayedAt)

  // Already played today → no risk.
  if (lastDayUTC === todayUTC) return null

  // If a full day or more has already passed since last play, the
  // streak-grace logic will handle it; the banner is for *today* only.
  if (todayUTC - lastDayUTC > 24 * 60 * 60 * 1000) return null

  return currentStreak
}

/**
 * Shows a banner when a logged-in user with an active streak hasn't played
 * today yet — complements the existing streak-risk email so users see the
 * nudge in-app too. It sits right above the home Play button, so it carries
 * no CTA of its own. Dismissal persists only for the current UTC day.
 */
export function StreakRiskBanner() {
  const { t } = useTranslation()
  const { data: session } = useSession()
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

    fetchStreakAtRisk(controller.signal)
      .then((atRiskStreak) => {
        if (controller.signal.aborted || atRiskStreak === null) return
        setStreak(atRiskStreak)
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
    <Alert
      variant="neon"
      role="status"
      className="mx-auto flex max-w-xl items-center gap-3 py-2 pl-3 pr-1"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-neon-pink/15">
        <Flame className="size-5 text-neon-pink" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <AlertTitle className="text-sm font-semibold text-foreground">
          {t('streakRisk.title', { count: streak })}
        </AlertTitle>
        <AlertDescription className="text-sm text-muted-foreground">
          {t('streakRisk.subtitle')}
        </AlertDescription>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleDismiss}
        className="shrink-0 text-muted-foreground"
        aria-label={t('common.close')}
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
    </Alert>
  )
}
