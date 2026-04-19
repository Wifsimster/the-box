import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
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
    <Dialog open={open} onOpenChange={(next) => { if (!next) onContinueAsGuest() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Trophy className="w-5 h-5 text-neon-pink" />
            {t('guestGate.title')}
          </DialogTitle>
          <DialogDescription>{t('guestGate.subtitle')}</DialogDescription>
        </DialogHeader>

        <ul className="grid gap-2 my-4 text-sm">
          <li className="flex items-start gap-3 p-2 rounded-lg bg-card/40 border border-white/5">
            <Flame className="w-4 h-4 text-neon-pink mt-0.5 shrink-0" />
            <span>{t('guestGate.benefitStreak')}</span>
          </li>
          <li className="flex items-start gap-3 p-2 rounded-lg bg-card/40 border border-white/5">
            <Trophy className="w-4 h-4 text-neon-cyan mt-0.5 shrink-0" />
            <span>{t('guestGate.benefitLeaderboard')}</span>
          </li>
          <li className="flex items-start gap-3 p-2 rounded-lg bg-card/40 border border-white/5">
            <Gift className="w-4 h-4 text-neon-purple mt-0.5 shrink-0" />
            <span>{t('guestGate.benefitHints')}</span>
          </li>
        </ul>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onContinueAsGuest}>
            {t('guestGate.continueGuest')}
          </Button>
          <Button variant="gaming" onClick={onCreateAccount}>
            {t('guestGate.createAccount')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
