import { useTranslation } from 'react-i18next'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from '@/components/ui/responsive-dialog'
import { Button } from '@/components/ui/button'
import { Trophy, Flame, Gift } from 'lucide-react'

interface GuestGateModalProps {
  open: boolean
  onCreateAccount: () => void
  onContinueAsGuest: () => void
}

export function GuestGateModal({ open, onCreateAccount, onContinueAsGuest }: GuestGateModalProps) {
  const { t } = useTranslation()

  return (
    <ResponsiveDialog open={open} onOpenChange={(next) => { if (!next) onContinueAsGuest() }}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center gap-2 text-xl">
            <Trophy className="size-5 text-neon-pink" />
            {t('guestGate.title')}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>{t('guestGate.subtitle')}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <ul className="grid gap-2 my-4 text-sm">
          <li className="flex items-start gap-3 p-2 rounded-lg bg-card/40 border border-white/5">
            <Flame className="size-4 text-neon-pink mt-0.5 shrink-0" />
            <span>{t('guestGate.benefitStreak')}</span>
          </li>
          <li className="flex items-start gap-3 p-2 rounded-lg bg-card/40 border border-white/5">
            <Trophy className="size-4 text-neon-cyan mt-0.5 shrink-0" />
            <span>{t('guestGate.benefitLeaderboard')}</span>
          </li>
          <li className="flex items-start gap-3 p-2 rounded-lg bg-card/40 border border-white/5">
            <Gift className="size-4 text-neon-purple mt-0.5 shrink-0" />
            <span>{t('guestGate.benefitHints')}</span>
          </li>
        </ul>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onContinueAsGuest}>
            {t('guestGate.continueGuest')}
          </Button>
          <Button variant="gaming" onClick={onCreateAccount}>
            {t('guestGate.createAccount')}
          </Button>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
