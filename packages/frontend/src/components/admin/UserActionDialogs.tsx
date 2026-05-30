import { useTranslation } from 'react-i18next'
import type { User } from '@/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, Crown } from 'lucide-react'

interface UserActionDialogsProps {
  banningUser: User | null
  unbanningUser: User | null
  grantingUser: User | null
  revokingUser: User | null
  isSubmitting: boolean
  onClose: () => void
  onBan: () => void
  onUnban: () => void
  onGrant: () => void
  onRevoke: () => void
}

export function UserActionDialogs({
  banningUser,
  unbanningUser,
  grantingUser,
  revokingUser,
  isSubmitting,
  onClose,
  onBan,
  onUnban,
  onGrant,
  onRevoke,
}: UserActionDialogsProps) {
  const { t } = useTranslation()
  return (
    <>
      {/* Ban Confirmation Dialog */}
      <Dialog open={!!banningUser} onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.users.banUser')}</DialogTitle>
            <DialogDescription>
              {banningUser && t('admin.users.confirmBan', { email: banningUser.email })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={onBan} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              {t('admin.users.banUser')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unban Confirmation Dialog */}
      <Dialog open={!!unbanningUser} onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.users.unbanUser')}</DialogTitle>
            <DialogDescription>
              {unbanningUser && t('admin.users.confirmUnban', { email: unbanningUser.email })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              {t('common.cancel')}
            </Button>
            <Button variant="default" onClick={onUnban} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              {t('admin.users.unbanUser')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Grant Premium Confirmation Dialog */}
      <Dialog open={!!grantingUser} onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.users.grantPremium')}</DialogTitle>
            <DialogDescription>
              {grantingUser && t('admin.users.confirmGrant', { email: grantingUser.email })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              {t('common.cancel')}
            </Button>
            <Button variant="gaming" onClick={onGrant} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              <Crown className="mr-1 size-4" />
              {t('admin.users.grantPremium')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Premium Confirmation Dialog */}
      <Dialog open={!!revokingUser} onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.users.revokePremium')}</DialogTitle>
            <DialogDescription>
              {revokingUser && t('admin.users.confirmRevoke', { email: revokingUser.email })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={onRevoke} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              {t('admin.users.revokePremium')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
