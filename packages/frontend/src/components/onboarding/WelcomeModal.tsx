import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
} from '@/components/ui/responsive-dialog'
import { Button } from '@/components/ui/button'
import { Sparkles, Gift, ArrowRight } from 'lucide-react'
import { consumeWelcomeFlag, setWelcomeActive } from './welcome-storage'
import { markTourCompleted, markTourPending } from './tour-storage'

const STEP_KEYS = ['onboarding.step1', 'onboarding.step2', 'onboarding.step3', 'onboarding.step4'] as const

export function WelcomeModal() {
  const { t } = useTranslation()
  // Consume the flag lazily on mount so we never setState inside an effect.
  const [isOpen, setIsOpen] = useState(() => consumeWelcomeFlag())

  useEffect(() => {
    setWelcomeActive(isOpen)
    return () => setWelcomeActive(false)
  }, [isOpen])

  // Hand off to the interactive home tour so the user immediately sees
  // where the daily challenge, leaderboard and rewards live.
  const handleStart = () => {
    setIsOpen(false)
    markTourPending()
  }

  // "Passer" skips the whole onboarding, tour included; it stays replayable
  // from the user menu.
  const handleSkip = () => {
    setIsOpen(false)
    markTourCompleted()
  }

  return (
    <ResponsiveDialog open={isOpen} onOpenChange={(open) => { if (!open) handleStart() }}>
      <ResponsiveDialogContent className="sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center justify-center gap-2 text-xl sm:justify-start">
            <Sparkles className="size-5 shrink-0 text-neon-purple" aria-hidden="true" />
            {t('onboarding.welcomeTitle')}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t('onboarding.welcomeSubtitle')}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="flex items-start gap-3 rounded-lg border border-neon-cyan/30 bg-neon-cyan/10 p-3">
          <Gift className="mt-0.5 size-5 shrink-0 text-neon-cyan" aria-hidden="true" />
          <p className="text-sm text-foreground">{t('onboarding.welcomeGift')}</p>
        </div>

        <section aria-labelledby="welcome-how-title" className="space-y-3">
          <h3 id="welcome-how-title" className="text-sm font-semibold text-foreground">
            {t('onboarding.howTitle')}
          </h3>
          <ol className="space-y-2.5 text-sm text-muted-foreground">
            {STEP_KEYS.map((key, index) => (
              <li key={key} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-neon-purple/20 text-xs font-bold text-neon-purple"
                >
                  {index + 1}
                </span>
                <span className="pt-0.5">{t(key)}</span>
              </li>
            ))}
          </ol>
        </section>

        <ResponsiveDialogFooter className="pt-2">
          <Button variant="ghost" onClick={handleSkip}>
            {t('onboarding.skip')}
          </Button>
          <Button variant="gaming" size="lg" className="w-full sm:w-auto" onClick={handleStart}>
            {t('onboarding.start')}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
