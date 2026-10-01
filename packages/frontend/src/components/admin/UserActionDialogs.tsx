import { useTranslation } from 'react-i18next'
import type { User } from '@/types'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

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
  const handleOpenChange = (open: boolean) => {
    if (!open && !isSubmitting) onClose()
  }
  const cancelLabel = t('common.cancel')
  return (
    <>
      <ConfirmDialog
        open={!!banningUser}
        onOpenChange={handleOpenChange}
        title={t('admin.users.banUser')}
        description={banningUser ? t('admin.users.confirmBan', { email: banningUser.email }) : undefined}
        confirmLabel={t('admin.users.banUser')}
        cancelLabel={cancelLabel}
        destructive
        busy={isSubmitting}
        onConfirm={onBan}
      />

      <ConfirmDialog
        open={!!unbanningUser}
        onOpenChange={handleOpenChange}
        title={t('admin.users.unbanUser')}
        description={unbanningUser ? t('admin.users.confirmUnban', { email: unbanningUser.email }) : undefined}
        confirmLabel={t('admin.users.unbanUser')}
        cancelLabel={cancelLabel}
        busy={isSubmitting}
        onConfirm={onUnban}
      />

      <ConfirmDialog
        open={!!grantingUser}
        onOpenChange={handleOpenChange}
        title={t('admin.users.grantPremium')}
        description={grantingUser ? t('admin.users.confirmGrant', { email: grantingUser.email }) : undefined}
        confirmLabel={t('admin.users.grantPremium')}
        cancelLabel={cancelLabel}
        busy={isSubmitting}
        onConfirm={onGrant}
      />

      <ConfirmDialog
        open={!!revokingUser}
        onOpenChange={handleOpenChange}
        title={t('admin.users.revokePremium')}
        description={revokingUser ? t('admin.users.confirmRevoke', { email: revokingUser.email }) : undefined}
        confirmLabel={t('admin.users.revokePremium')}
        cancelLabel={cancelLabel}
        destructive
        busy={isSubmitting}
        onConfirm={onRevoke}
      />
    </>
  )
}
