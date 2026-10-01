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
import { Trophy, Flame, Gift } from 'lucide-react'

interface GuestGateModalProps {
  open: boolean
  onCreateAccount: () => void
  onContinueAsGuest: () => void
}

const BENEFITS = [
  { key: 'guestGate.benefitStreak', icon: Flame, accent: 'text-neon-pink' },
  { key: 'guestGate.benefitLeaderboard', icon: Trophy, accent: 'text-neon-cyan' },
  { key: 'guestGate.benefitHints', icon: Gift, accent: 'text-neon-purple' },
] as const

export function GuestGateModal({ open, onCreateAccount, onContinueAsGuest }: GuestGateModalProps) {
  const { t } = useTranslation()

  return (
    <ResponsiveDialog open={open} onOpenChange={(next) => { if (!next) onContinueAsGuest() }}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center justify-center gap-2 text-xl sm:justify-start">
            <Trophy className="size-5 shrink-0 text-neon-pink" aria-hidden="true" />
            {t('guestGate.title')}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>{t('guestGate.subtitle')}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <ul className="grid gap-2 text-sm">
          {BENEFITS.map(({ key, icon: Icon, accent }) => (
            <li key={key} className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <Icon className={`mt-0.5 size-4 shrink-0 ${accent}`} aria-hidden="true" />
              <span className="text-foreground">{t(key)}</span>
            </li>
          ))}
        </ul>

        <ResponsiveDialogFooter className="pt-2">
          <Button variant="ghost" onClick={onContinueAsGuest}>
            {t('guestGate.continueGuest')}
          </Button>
          <Button variant="gaming" size="lg" className="w-full sm:w-auto" onClick={onCreateAccount}>
            {t('guestGate.createAccount')}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
