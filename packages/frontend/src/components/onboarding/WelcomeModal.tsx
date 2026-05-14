import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from '@/components/ui/responsive-dialog'
import { Button } from '@/components/ui/button'
import { Sparkles, Camera, Gift, Trophy, ArrowRight } from 'lucide-react'
import { consumeWelcomeFlag } from './welcome-storage'
import { markTourPending } from './tour-storage'

export function WelcomeModal() {
  const { t } = useTranslation()
  // Consume the flag lazily on mount so we never setState inside an effect.
  const [isOpen, setIsOpen] = useState(() => consumeWelcomeFlag())
  const [step, setStep] = useState<0 | 1>(0)

  const handleClose = () => {
    setIsOpen(false)
    // Hand off to the interactive home tour so the user immediately sees
    // where the daily challenge, leaderboard and rewards live.
    markTourPending()
  }

  const handleNext = () => {
    setStep(1)
  }

  return (
    <ResponsiveDialog open={isOpen} onOpenChange={handleClose}>
      <ResponsiveDialogContent className="sm:max-w-lg">
        {step === 0 ? (
          <>
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle className="flex items-center gap-2 text-xl">
                <Sparkles className="w-5 h-5 text-neon-purple" />
                {t('onboarding.welcomeTitle')}
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                {t('onboarding.welcomeSubtitle')}
              </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>

            <div className="grid gap-3 my-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-card/40 border border-white/5">
                <Gift className="w-5 h-5 text-neon-cyan mt-0.5 shrink-0" />
                <p className="text-sm text-foreground/90">
                  {t('onboarding.welcomeGift')}
                </p>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-card/40 border border-white/5">
                <Trophy className="w-5 h-5 text-neon-pink mt-0.5 shrink-0" />
                <p className="text-sm text-foreground/90">
                  {t('onboarding.welcomeRanked')}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={handleClose}>
                {t('onboarding.skip')}
              </Button>
              <Button variant="gaming" onClick={handleNext}>
                {t('onboarding.next')}
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </>
        ) : (
          <>
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle className="flex items-center gap-2 text-xl">
                <Camera className="w-5 h-5 text-neon-cyan" />
                {t('onboarding.howTitle')}
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                {t('onboarding.howSubtitle')}
              </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>

            <ol className="space-y-3 my-4 text-sm text-foreground/90">
              <li className="flex gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-neon-purple/20 text-neon-purple font-bold text-xs shrink-0">1</span>
                <span>{t('onboarding.step1')}</span>
              </li>
              <li className="flex gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-neon-cyan/20 text-neon-cyan font-bold text-xs shrink-0">2</span>
                <span>{t('onboarding.step2')}</span>
              </li>
              <li className="flex gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-neon-pink/20 text-neon-pink font-bold text-xs shrink-0">3</span>
                <span>{t('onboarding.step3')}</span>
              </li>
            </ol>

            <div className="flex justify-end">
              <Button variant="gaming" onClick={handleClose}>
                {t('onboarding.start')}
              </Button>
            </div>
          </>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
